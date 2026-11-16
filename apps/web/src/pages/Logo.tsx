/** The PLANetBAO mark: a ringed planet among a few stars. */
export function Logo({ size = 28, bare = false }: { size?: number; bare?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {/* `bare` drops the dark square, for use on the already dark header. */}
      {!bare && <rect width="64" height="64" rx="14" fill="#0b1026" />}
      <circle cx="14" cy="14" r="1.6" fill="#fff" />
      <circle cx="50" cy="12" r="1.2" fill="#fff" />
      <circle cx="52" cy="50" r="1.5" fill="#fff" />
      <circle cx="32" cy="32" r="14" fill="#f59e0b" />
      <ellipse
        cx="32"
        cy="32"
        rx="25"
        ry="7"
        fill="none"
        stroke="#a5b4fc"
        strokeWidth="3"
        transform="rotate(-20 32 32)"
      />
      {/* The top of the planet again, so the ring passes behind it. */}
      <path d="M19.5 27a14 14 0 0 1 25 0" fill="#f59e0b" />
    </svg>
  )
}
