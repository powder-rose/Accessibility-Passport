const paths = {
  building:
    'M8 35V9h20v26M28 18h9v17M4 35h36M13 15h3m5 0h2m-10 6h3m5 0h2m-10 6h3m5 0h2M17 35v-5h6v5',
  route: 'M7 11h12v11h14v13M7 6v10m-5-5h10m15 19 6 6 6-6M5 31h12m-6-6v12',
  document: 'M12 5h15l8 8v26H9V5h3m15 0v9h8M15 21h14m-14 6h14m-14 6h9',
  check:
    'M22 4 37 10v12c0 8-8 15-15 18C15 37 7 30 7 22V10L22 4Zm-8 18 6 6 11-12',
  capture:
    'M6 12h8l3-5h10l3 5h8v24H6V12Zm24 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM32 17h1',
  people:
    'M22 21a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM10 37v-5c0-6 5-10 12-10s12 4 12 10v5M6 13a5 5 0 0 0 0 10m32-10a5 5 0 0 1 0 10',
} as const;

export type ServiceGlyphName = keyof typeof paths;

export default function ServiceGlyph({ name }: { name: ServiceGlyphName }) {
  return (
    <svg
      className="service-glyph"
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={paths[name]}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
