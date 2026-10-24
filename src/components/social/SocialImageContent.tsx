/**
 * Shared JSX content for Open Graph and Twitter social preview images.
 * Used by both opengraph-image.tsx and twitter-image.tsx to avoid duplication.
 */
export function SocialImageContent() {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        position: 'relative',
      }}
    >
      {/* Grid pattern overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage:
            'linear-gradient(to right, rgba(30, 41, 59, 0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(30, 41, 59, 0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Gradient glow effect */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '800px',
          height: '800px',
          background: 'radial-gradient(circle, rgba(0, 210, 106, 0.15) 0%, transparent 70%)',
          borderRadius: '50%',
        }}
      />

      {/* Logo and brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '40px',
        }}
      >
        {/* Timmie icon (a smiling stopwatch) in a green box */}
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '16px',
            background: '#00D26A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 40px rgba(0, 210, 106, 0.4)',
          }}
        >
          <svg width="56" height="56" viewBox="2 2 28 28" fill="none">
            <g stroke="#020617" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="16" cy="18" r="10" />
              <path d="M16 8V5.5M13.5 4.5h5" />
              <path d="M11.8 20.6Q16 24.6 20.2 20.6" strokeWidth="2.4" />
            </g>
            <circle cx="12.6" cy="16.2" r="1.7" fill="#020617" />
            <circle cx="19.4" cy="16.2" r="1.7" fill="#020617" />
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontSize: '64px',
              fontWeight: 700,
              color: 'white',
              letterSpacing: '-1px',
            }}
          >
            Timmie
          </span>
          <span
            style={{
              fontSize: '24px',
              color: '#94a3b8',
              marginTop: '-8px',
            }}
          >
            by KnowAll.ai
          </span>
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span
          style={{
            fontSize: '42px',
            fontWeight: 600,
            color: 'white',
          }}
        >
          Time Tracking,
        </span>
        <span
          style={{
            fontSize: '42px',
            fontWeight: 600,
            color: '#00D26A',
          }}
        >
          Perfectly Synced
        </span>
      </div>

      {/* Subtitle */}
      <div
        style={{
          marginTop: '32px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 24px',
          background: 'rgba(30, 41, 59, 0.6)',
          borderRadius: '100px',
          border: '1px solid rgba(51, 65, 85, 0.8)',
        }}
      >
        {/* Microsoft logo */}
        <svg width="24" height="24" viewBox="0 0 21 21" fill="none">
          <rect x="1" y="1" width="9" height="9" fill="#F25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
          <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
          <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
        </svg>
        <span
          style={{
            fontSize: '20px',
            color: '#cbd5e1',
          }}
        >
          Powered by Microsoft Dynamics 365 Business Central
        </span>
      </div>
    </div>
  );
}
