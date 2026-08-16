import { redirect } from 'next/navigation';

export default function LeaderboardsRoot() {
  redirect('/leaderboards/fastest_growing_pct/all');
}
