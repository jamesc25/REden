import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { getPlantTreeCost } from '@/app/common/Costs';

export const runtime = "nodejs";

interface Construction {
  id: number;
  type: string;
  location: string;
  userid: string; // user id
  created: number;
}
interface Data {
  constructions: Construction[];
}

const dbFile = join(process.cwd(), 'data', 'db.json');
const adapter = new JSONFile<Data>(dbFile);
const db = new Low<Data>(adapter, { constructions: [] });

async function ensureDb() {
  await db.read();
  db.data ||= { constructions: [] };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  await ensureDb();
  // Required: location, type (userid only required for settlement)
  if (!body.location || !body.type || (body.type === 'settlement' && !body.userid)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  // Defensive: ensure constructions array exists
  if (!db.data) db.data = { constructions: [] };
  if (!Array.isArray(db.data.constructions)) db.data.constructions = [];
  // Add construction
  const construction: any = {
    id: Date.now(),
    type: body.type,
    location: body.location,
    created: Date.now(),
    timestamp: Date.now(), // Add construction timestamp
  };
  // Only add userid for settlement type
  if (body.type === 'settlement' && body.userid) {
    construction.userid = body.userid;
  }
  db.data.constructions.push(construction);

  // If planting a tree, also create a transaction for the cost
  if (body.type === 'tree' && body.userid) {
    // Defensive: ensure transactions and users exist
    // @ts-ignore: Data type only has constructions, but db.json has users/transactions
    const dbAny = db as any;
    if (!Array.isArray(dbAny.data.transactions)) dbAny.data.transactions = [];
    if (!Array.isArray(dbAny.data.users)) dbAny.data.users = [];
    const user = dbAny.data.users.find((u: { id: number }) => u.id === Number(body.userid));
    if (user) {
      const treeCost = getPlantTreeCost();
      dbAny.data.transactions.push({
        id: Date.now(),
        wallet: user.wallet,
        amount: -Number(treeCost),
        userId: user.id,
        timestamp: Date.now(),
        type: 'construct-tree',
      });
    }
  }
  await db.write();
  return NextResponse.json({ ok: true, construction });
}

export async function GET(req: NextRequest) {
  await ensureDb();
  const { searchParams } = new URL(req.url);
  const location = searchParams.get('location');
  const locations = searchParams.getAll('locations');
  if (location) {
    // Single location (legacy)
    if (!db.data) db.data = { constructions: [] };
    if (!Array.isArray(db.data.constructions)) db.data.constructions = [];
    const constructions = db.data.constructions.filter(c => c.location === location);
    return NextResponse.json({ constructions });
  } else if (locations && locations.length > 0) {
    // Multiple locations
    if (!db.data) db.data = { constructions: [] };
    if (!Array.isArray(db.data.constructions)) db.data.constructions = [];
    const result: { [loc: string]: Construction[] } = {};
    for (const loc of locations) {
      result[loc] = db.data.constructions.filter(c => c.location === loc);
    }
    return NextResponse.json({ constructions: result });
  } else if (searchParams.get('all') === '1') {
    // Return all constructions
    if (!db.data) db.data = { constructions: [] };
    if (!Array.isArray(db.data.constructions)) db.data.constructions = [];
    return NextResponse.json({ constructions: db.data.constructions });
  } else {
    // No location(s) provided
    return NextResponse.json({ error: 'Missing location(s)' }, { status: 400 });
  }
}
