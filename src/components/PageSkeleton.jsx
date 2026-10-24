// Shown for the moment it takes a tab's code to arrive (first visit on a slow connection).
// Same shape as a page: a title block, then cards. Shimmer only moves a layer, so it costs almost nothing.
export default function PageSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">Loading</p>
      <div className="mb-7 space-y-3">
        <div className="skeleton h-10 w-2/3 max-w-md rounded-2xl" />
        <div className="skeleton h-4 w-1/2 max-w-sm rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-40 rounded-3xl" />)}
      </div>
    </div>
  );
}
