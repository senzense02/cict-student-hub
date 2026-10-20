// Page title and subtitle; extra content (e.g. a button) goes on the right.
export default function PageHeader({ title, sub, children }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[2.1rem] font-medium leading-[1.05] tracking-[-0.03em] sm:text-[2.6rem]">{title}</h1>
        {sub && <p className="mt-2 max-w-xl text-[15px] text-muted">{sub}</p>}
      </div>
      {children}
    </header>
  );
}
