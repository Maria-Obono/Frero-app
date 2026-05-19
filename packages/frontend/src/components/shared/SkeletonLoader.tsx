interface SkeletonLoaderProps {
  width?: string;
  height?: string;
  className?: string;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  count?: number;
}

const roundedMap = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

export function SkeletonLoader({
  width,
  height,
  className = '',
  rounded = 'md',
  count = 1,
}: SkeletonLoaderProps) {
  const baseClasses = `bg-gray-200 dark:bg-gray-700 animate-pulse ${roundedMap[rounded]}`;

  const style: React.CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${baseClasses} ${className}`}
          style={style}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

/** Pre-built skeleton for a post card layout */
export function PostCardSkeleton() {
  return (
    <div className="p-4 space-y-3" aria-label="Loading post" role="status">
      <div className="flex items-center gap-3">
        <SkeletonLoader width="40px" height="40px" rounded="full" />
        <div className="space-y-2 flex-1">
          <SkeletonLoader height="14px" className="w-1/3" />
          <SkeletonLoader height="12px" className="w-1/5" />
        </div>
      </div>
      <SkeletonLoader height="200px" className="w-full" />
      <div className="flex gap-4">
        <SkeletonLoader height="14px" className="w-16" />
        <SkeletonLoader height="14px" className="w-16" />
        <SkeletonLoader height="14px" className="w-16" />
      </div>
    </div>
  );
}

/** Pre-built skeleton for a user card */
export function UserCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3" aria-label="Loading user" role="status">
      <SkeletonLoader width="48px" height="48px" rounded="full" />
      <div className="space-y-2 flex-1">
        <SkeletonLoader height="14px" className="w-2/5" />
        <SkeletonLoader height="12px" className="w-1/4" />
      </div>
    </div>
  );
}

/** Pre-built skeleton for a user profile page */
export function ProfileSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading profile" role="status">
      {/* Cover photo */}
      <SkeletonLoader height="200px" className="w-full" rounded="none" />
      {/* Avatar + name area */}
      <div className="px-4 -mt-12 flex items-end gap-4">
        <SkeletonLoader width="96px" height="96px" rounded="full" />
        <div className="space-y-2 flex-1 pb-2">
          <SkeletonLoader height="20px" className="w-1/3" />
          <SkeletonLoader height="14px" className="w-1/5" />
        </div>
      </div>
      {/* Bio */}
      <div className="px-4 space-y-2">
        <SkeletonLoader height="14px" className="w-full" />
        <SkeletonLoader height="14px" className="w-3/4" />
      </div>
      {/* Stats */}
      <div className="px-4 flex gap-6">
        <SkeletonLoader height="14px" className="w-20" />
        <SkeletonLoader height="14px" className="w-20" />
        <SkeletonLoader height="14px" className="w-20" />
      </div>
    </div>
  );
}

/** Pre-built skeleton for the story bar */
export function StoryBarSkeleton() {
  return (
    <div className="flex gap-3 p-4 overflow-hidden" aria-label="Loading stories" role="status">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1 shrink-0">
          <SkeletonLoader width="64px" height="64px" rounded="full" />
          <SkeletonLoader width="48px" height="10px" />
        </div>
      ))}
    </div>
  );
}

export default SkeletonLoader;
