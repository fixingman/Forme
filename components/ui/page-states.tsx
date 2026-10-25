export function Header({
  title,
  description,
  children,
  status,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
  status?: React.ReactNode;
}) {
  return (
    <>
      <div className="head">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {children && <div className="head-actions">{children}</div>}
      </div>
      {status}
    </>
  );
}
export function Empty({
  children,
  title,
  action,
}: {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      {title && <h2>{title}</h2>}
      <div className="empty-description">{children}</div>
      {action && <div className="empty-actions">{action}</div>}
    </div>
  );
}

export function ListingSkeleton() {
  return (
    <div className="feed-loading" role="status" aria-label="Loading listings">
      <h1>Loading your edit</h1>
      <div className="skeleton-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <div />
            <span />
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}
