import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

// Path to db.json
const dbFile = join(process.cwd(), 'data', 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { users: [], transactions: [], constructions: [] });

// Helper type for db.data
interface DBData {
  users: any[];
  transactions: any[];
  constructions: any[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet');

  await db.read();
  const data = db.data as DBData;

  // Fetch user info if wallet is provided
  let user: any = null;
  if (wallet) {
    user = data.users.find((u: any) => u.wallet === wallet);
    if (user) {
      // Attach transactions and balance
      const userTransactions = data.transactions.filter((tx: any) => tx.userId === user.id);
      const balance = userTransactions.reduce((sum: number, tx: any) => sum + (typeof tx.amount === 'number' ? tx.amount : 0), 0);
      user = {
        ...user,
        transactions: userTransactions,
        balance,
      };
    }
  }

  // Fetch all users (for locations)
  const allUsers = data.users.map((u: any) => ({
    id: u.id,
    name: u.name,
    wallet: u.wallet,
    location: u.location || null,
    userid: u.id // for compatibility with frontend
  }));

  // Fetch all constructions
  const allConstructions = data.constructions || [];

  // Compose response
  const response: any = {
    allUsers,
    allConstructions
  };
  if (wallet && user) {
    response.user = user;
  }
  return NextResponse.json(response);
}
