export default function Breadcrumbs({ current }: { current: string }) {
  return (
    <nav className="container breadcrumbs" aria-label="Навигационная цепочка">
      <ol>
        <li>
          <a href="/">Главная</a>
        </li>
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}
