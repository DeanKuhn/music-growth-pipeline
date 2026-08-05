import { LoadingState, Skeleton } from '@/components/LoadingState';

export default function Loading() {
  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 40 }}>
      <LoadingState
        skeleton={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Skeleton height={32} width="40%" />
            <Skeleton height={16} width="25%" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <Skeleton height={78} />
              <Skeleton height={78} />
              <Skeleton height={78} />
              <Skeleton height={78} />
            </div>
            <Skeleton height={280} />
            <Skeleton height={280} />
          </div>
        }
      />
    </div>
  );
}
