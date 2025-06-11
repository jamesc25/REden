import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

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
  type: string; // e.g. 'deposit', 'withdrawal'
  balance?: number; // New field: balance after transaction
}
interface Data {
  users: User[];
  transactions: Transaction[];
}

// Path to JSON file
const dbFile = join(process.cwd(), 'data', 'db.json');
const adapter = new JSONFile<Data>(dbFile);
const db = new Low<Data>(adapter, { users: [], transactions: [] });

async function ensureDb() {
  await db.read();
  db.data ||= { users: [], transactions: [] };
}

// Find or create user by wallet, and sum deposits
function getUserDeposit(wallet: string) {
  const deposits = db.data!.users.filter(u => u.wallet === wallet && typeof u.deposit === 'number');
  return deposits.reduce((sum, u) => sum + (u.deposit || 0), 0);
}

// Find user by wallet
function getUserByWallet(wallet: string) {
  return db.data!.users.find(u => u.wallet === wallet && u.name);
}
// Find user by username
function getUserByName(name: string) {
  return db.data!.users.find(u => u.name === name);
}

// Utility to get in-game balance by userId
function getUserBalance(userId: number) {
  if (!Array.isArray(db.data!.transactions)) return 0;
  return db.data!.transactions
    .filter(tx => tx.userId === userId)
    .reduce((sum, tx) => sum + (typeof tx.amount === 'number' ? tx.amount : 0), 0);
}

// --- Add transactions API endpoint ---
export async function GET(req: NextRequest) {
  await ensureDb();
  const { searchParams, pathname } = new URL(req.url);
  if (pathname.endsWith('/transactions')) {
    const userId = searchParams.get('userId');
    if (userId) {
      // Return all transactions for this userId
      return NextResponse.json(db.data!.transactions.filter(tx => String(tx.userId) === String(userId)));
    }
    const wallet = searchParams.get('wallet');
    if (wallet) {
      // Return all transactions for this wallet
      return NextResponse.json(db.data!.transactions.filter(tx => tx.wallet === wallet));
    }
    // Return all transactions if no filter
    return NextResponse.json(db.data!.transactions);
  }
  const wallet = searchParams.get('wallet');
  const id = searchParams.get('id');
  if (wallet) {
    // Return user info (id, username, balance, location as string)
    const user = getUserByWallet(wallet);
    const userId = user?.id;
    // Calculate in-game balance from transactions
    const balance = userId ? getUserBalance(userId) : 0;
    // Always return location as string (e.g. "3,4")
    let location: string | null = null;
    if (user?.location) {
      location = user.location;
    }
    return NextResponse.json({ id: userId, username: user?.name || null, balance, location });
  }
  if (id) {
    // Return user by id, and sum all transactions for balance
    const user = db.data!.users.find(u => String(u.id) === String(id));
    if (user) {
      // Sum all transactions for this userId
      const balance = db.data!.transactions
        .filter(tx => String(tx.userId) === String(id))
        .reduce((sum, tx) => sum + (typeof tx.amount === 'number' ? tx.amount : 0), 0);
      return NextResponse.json({ ...user, balance });
    } else {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
  }
  // Optionally: support username uniqueness check
  const username = searchParams.get('username');
  if (username) {
    const exists = !!getUserByName(username);
    return NextResponse.json({ exists });
  }
  return NextResponse.json(db.data!.users);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  await ensureDb();
  // Username registration
  if (body.username && body.wallet) {
    // Check uniqueness
    if (getUserByName(body.username)) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }
    // Only add username if wallet is not already registered with a name
    if (!getUserByWallet(body.wallet)) {
      // Place player at random tile that is not occupied by another user
      const occupied = new Set(
        db.data!.users
          .map(u => typeof u.location === 'string' ? u.location : null)
          .filter(Boolean)
      );
      let randomTile: string;
      let tries = 0;
      do {
        randomTile = `${Math.floor(Math.random() * 20)},${Math.floor(Math.random() * 20)}`;
        tries++;
      } while (occupied.has(randomTile) && tries < 400);
      db.data!.users.push({ id: Date.now(), name: body.username, wallet: body.wallet, location: randomTile });
      await db.write();
      return NextResponse.json({ ok: true, location: randomTile });
    } else {
      // If wallet exists but has no name, update it
      const user = db.data!.users.find(u => u.wallet === body.wallet && !u.name);
      if (user) {
        user.name = body.username;
        // Always store location as string
        if (!user.location) {
          user.location = `${Math.floor(Math.random() * 20)},${Math.floor(Math.random() * 20)}`;
        } else if (Array.isArray(user.location)) {
          user.location = user.location.join(',');
        }
        await db.write();
        return NextResponse.json({ ok: true, location: user.location });
      }
      return NextResponse.json({ error: 'Wallet already registered with a username' }, { status: 409 });
    }
  }
  // Register wallet only if not present
  if (body.wallet && !body.username && typeof body.amount !== 'number') {
    // Do not create a new user if username is not provided
    return NextResponse.json({ error: 'Username required to create user' }, { status: 400 });
  }
  // Accept wallet and amount, record as a new deposit entry
  if (body.wallet && typeof body.amount === 'number') {
    await ensureDb();
    if (!Array.isArray(db.data!.transactions)) db.data!.transactions = [];
    const user = db.data!.users.find(u => u.wallet === body.wallet && u.name);
    const userId = user ? user.id : -1;
    const timestamp = Date.now();
    const type = body.type || (body.amount < 0 ? 'move' : 'deposit');
    // Calculate new balance for this userId
    let balance = 0;
    if (userId !== -1) {
      balance = db.data!.transactions
        .filter(tx => tx.userId === userId)
        .reduce((sum, tx) => sum + (typeof tx.amount === 'number' ? tx.amount : 0), 0);
      balance += body.amount;
    }
    db.data!.transactions.push({ id: timestamp, wallet: body.wallet, amount: body.amount, userId, timestamp, type, balance });
    await db.write();
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}
