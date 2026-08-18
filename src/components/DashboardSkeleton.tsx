import { Skeleton, SkeletonRegion } from './Skeleton'

/**
 * Stands in for the template table while it loads.
 *
 * Shaped like the real rows so the swap to content doesn't jolt the layout —
 * and so the dashboard stops rendering "No templates yet" during a load, which
 * read as a definite answer before one existed.
 */
export function TemplateTableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SkeletonRegion label="Loading your templates">
      <div className="skeleton-card">
        {Array.from({ length: rows }, (_, index) => (
          <div className="skeleton-row" key={index}>
            <span className="skeleton-stack">
              <Skeleton height={14} width="65%" delay={index * 80} />
              <Skeleton height={10} width="40%" delay={index * 80 + 40} />
            </span>
            <Skeleton height={20} width={72} radius={999} delay={index * 80} />
            <Skeleton height={14} width={24} delay={index * 80} />
            <Skeleton height={30} width="70%" delay={index * 80} />
            <Skeleton height={30} width={96} delay={index * 80} />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/** Stands in for the submissions list, which loads alongside the templates. */
export function SubmissionListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <SkeletonRegion label="Loading submissions">
      <div className="skeleton-card">
        {Array.from({ length: rows }, (_, index) => (
          <div className="skeleton-row skeleton-row-submission" key={index}>
            <span className="skeleton-stack">
              <Skeleton height={14} width="55%" delay={index * 80} />
              <Skeleton height={10} width="35%" delay={index * 80 + 40} />
            </span>
            <Skeleton height={20} width={60} radius={999} delay={index * 80} />
            <Skeleton height={28} width={140} delay={index * 80} />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/** The admin header, so the top of the page doesn't pop in after the table. */
export function WorkspaceHeaderSkeleton() {
  return (
    <SkeletonRegion label="Loading workspace">
      <header className="app-header">
        <div className="app-header-top">
          <div className="app-header-identity">
            <Skeleton height={30} width={180} />
            <Skeleton height={13} width={120} delay={60} className="skeleton-text" />
          </div>
          <div className="app-header-actions">
            <Skeleton height={34} width={130} radius={8} delay={120} />
          </div>
        </div>
      </header>
    </SkeletonRegion>
  )
}

/** Stands in for a rendering PDF page, at roughly US Letter proportions. */
export function DocumentSkeleton({ label = 'Loading document' }: { label?: string }) {
  return (
    <SkeletonRegion label={label}>
      <Skeleton className="skeleton-page" />
    </SkeletonRegion>
  )
}
