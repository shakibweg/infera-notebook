import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/actions/user';
import { deductCredit } from '@/actions/credits';

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const success = await deductCredit(user.id);
    if (!success) {
      return NextResponse.json({ error: 'Credits exhausted.' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[CREDITS_DEDUCT]', error);
    return NextResponse.json({ error: 'Failed to deduct credit' }, { status: 500 });
  }
}
