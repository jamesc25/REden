import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { getConquerProbability } from '../../common/Radius';

// Force Next.js API route to use Node.js runtime
export const runtime = "nodejs";

// Define types
interface User {
  id: number;
  name: string;
  wallet?: string;
  deposit?: number;
  location?: string; // Store location as string, not array
}
interface Transaction {
  id: number;
  wallet: string;
  amount: number;
  userId: number;
  timestamp: number; // Unix ms
  type: string; // e.g. 'deposit', 'withdrawal', 'move'
}
interface Construction {
  id: number;
  type: string;
  location: string;
  userid?: string;
  created?: number;
  timestamp?: number;
}
interface Data {
  users: User[];
  transactions: Transaction[];
  constructions: Construction[];
}

// Path to JSON file
const dbFile = join(process.cwd(), 'data', 'db.json');
const adapter = new JSONFile<Data>(dbFile);
const db = new Low<Data>(adapter, { users: [], transactions: [], constructions: [] });

async function ensureDb() {
  await db.read();
  db.data ||= { users: [], transactions: [], constructions: [] };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  await ensureDb();
  // Conquer API: expects { id, amount, location, conquer: true, conquerCost }
  if (body.conquer === true) {
    // Validate conquer fields
    if (typeof body.id === 'undefined' || typeof body.amount !== 'number' || typeof body.conquerCost !== 'number' || !Array.isArray(body.location) || body.location.length !== 2) {
      return NextResponse.json({ error: 'Invalid conquer request' }, { status: 400 });
    }
    // Find user by id
    const user = db.data!.users.find(u => u.id.toString() === body.id.toString());
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    // Get wallet from user
    const wallet = user.wallet || '';
    const userId = user.id;
    const timestamp = Date.now();
    // --- Conquer probability check ---
    // Only map constructions if needed for conquer
    let conquerProbability: number | null = null;
    let success = true;
    if (body.tileSize && body.offset) {
      // Only compute and consume if conquer is attempted
      const constructions = db.data!.constructions.map(c => ({
        ...c,
        location: (typeof c.location === 'string' ? c.location.split(',').map(Number) : c.location).slice(0, 2) as [number, number]
      }));
      conquerProbability = getConquerProbability(
        constructions,
        userId.toString(),
        body.location,
        body.tileSize,
        body.offset
      );
      console.log('[DEBUG] conquerProbability:', conquerProbability);
      success = conquerProbability !== null && Math.random() < conquerProbability;
      console.log('[DEBUG] conquer success:', success);
    }
    if (body.tileSize && body.offset && !success) {
      // Conquer failed: do not move, do not change owner, but still charge conquer cost
      db.data!.transactions.push({ id: timestamp, wallet, amount: Number(body.conquerCost), userId, timestamp, type: 'conquer-fail' });
      await db.write();
      return NextResponse.json({ ok: false, conquerSuccess: false, conquerProbability }, { status: 200 });
    }
    // Deduct conquer cost as a separate transaction (only if conquer attempted)
    if (body.tileSize && body.offset) {
      db.data!.transactions.push({ id: timestamp, wallet, amount: Number(body.conquerCost), userId, timestamp, type: 'conquer' });
    }
    // Also log the move transaction
    db.data!.transactions.push({ id: timestamp + 1, wallet, amount: Number(body.amount), userId, timestamp: timestamp + 1, type: 'move' });
    // Update user location
    user.location = body.location.join(',');
    // Update ownership of the conquered settlement in constructions
    if (body.tileSize && body.offset && db.data!.constructions) {
      const locStr = body.location.join(',');
      const settlement = db.data!.constructions.find(
        (c: any) => c.type === 'settlement' && c.location === locStr
      );
      if (settlement) {
        settlement.userid = userId.toString();
      }
    }
    await db.write();
    return NextResponse.json({ ok: true, conquerSuccess: body.tileSize && body.offset ? true : undefined, conquerProbability }, { status: 201 });
  }
  // Validate required fields
  if (typeof body.id === 'undefined' || typeof body.amount !== 'number' || !Array.isArray(body.location) || body.location.length !== 2) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  // Find user by id
  const user = db.data!.users.find(u => u.id.toString() === body.id.toString());
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  // Get wallet from user
  const wallet = user.wallet || '';
  const userId = user.id;
  const timestamp = Date.now();
  db.data!.transactions.push({ id: timestamp, wallet, amount: Number(body.amount), userId, timestamp, type: 'move' });
  // Update user location
  user.location = body.location.join(',');
  await db.write();
  return NextResponse.json({ ok: true }, { status: 201 });
}
