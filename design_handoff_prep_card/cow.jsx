// cow.jsx — TED PICK 마스코트
// 3 states: sleeping (새벽) · watching (오전) · organizing (오후)

function Cow({ state = 'sleeping', size = 108 }) {
  const aspect = 140 / 120;
  return (
    <div className={`cow cow-${state}`}
         style={{ width: size * aspect, height: size, flexShrink: 0 }}
         aria-hidden="true">
      <svg viewBox="0 0 140 120" width="100%" height="100%" style={{display:'block', overflow:'visible'}}>
        {/* ============ Body (animated as a group) ============ */}
        <g className="cow-body-grp">

          {/* black patch on top of head (cow print) */}
          <path d="M28 38 Q34 26 52 30 Q63 36 53 50 Q34 54 28 38 Z" fill="#1f1a14"/>
          <ellipse cx="78" cy="44" rx="9" ry="5" fill="#1f1a14" opacity="0.85"/>

          {/* ears */}
          <g className="ear ear-l">
            <ellipse cx="28" cy="50" rx="11" ry="6.5" fill="#fffaf2" stroke="#1f1a14" strokeWidth="2"
                     transform="rotate(-28 28 50)"/>
            <ellipse cx="28" cy="50" rx="6.5" ry="3.2" fill="#ffd4cc"
                     transform="rotate(-28 28 50)"/>
          </g>
          <g className="ear ear-r">
            <ellipse cx="92" cy="50" rx="11" ry="6.5" fill="#fffaf2" stroke="#1f1a14" strokeWidth="2"
                     transform="rotate(28 92 50)"/>
            <ellipse cx="92" cy="50" rx="6.5" ry="3.2" fill="#ffd4cc"
                     transform="rotate(28 92 50)"/>
          </g>

          {/* horns (small nubs) */}
          <ellipse cx="44" cy="28" rx="4" ry="6" fill="#f5e8d0" stroke="#1f1a14" strokeWidth="1.8"/>
          <ellipse cx="76" cy="28" rx="4" ry="6" fill="#f5e8d0" stroke="#1f1a14" strokeWidth="1.8"/>

          {/* head */}
          <ellipse cx="60" cy="62" rx="38" ry="33" fill="#fffaf2" stroke="#1f1a14" strokeWidth="2.5"/>

          {/* re-draw top patch ABOVE head outline so it sits on the face */}
          <path d="M30 42 Q36 32 52 36 Q60 42 50 52 Q34 53 30 42 Z" fill="#1f1a14"/>

          {/* muzzle */}
          <ellipse cx="60" cy="76" rx="20" ry="14" fill="#ffc9b9" stroke="#1f1a14" strokeWidth="2"/>
          <ellipse cx="53" cy="74" rx="1.6" ry="2.2" fill="#1f1a14"/>
          <ellipse cx="67" cy="74" rx="1.6" ry="2.2" fill="#1f1a14"/>
          <path d="M55 84 Q60 87 65 84" stroke="#1f1a14" strokeWidth="2" fill="none" strokeLinecap="round"/>

          {/* cheek blush */}
          <ellipse cx="34" cy="72" rx="4" ry="2.5" fill="#ffb0a0" opacity="0.55"/>
          <ellipse cx="86" cy="72" rx="4" ry="2.5" fill="#ffb0a0" opacity="0.55"/>

          {/* ============ Eyes — per state ============ */}
          {state === 'sleeping' && (
            <g>
              <path d="M42 60 Q48 64 54 60" stroke="#1f1a14" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
              <path d="M66 60 Q72 64 78 60" stroke="#1f1a14" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
            </g>
          )}
          {state === 'watching' && (
            <g className="eyes-scan">
              <ellipse cx="48" cy="60" rx="3.2" ry="3.8" fill="#1f1a14"/>
              <ellipse cx="72" cy="60" rx="3.2" ry="3.8" fill="#1f1a14"/>
              <circle cx="49.2" cy="58.6" r="1" fill="#fff"/>
              <circle cx="73.2" cy="58.6" r="1" fill="#fff"/>
            </g>
          )}
          {state === 'organizing' && (
            <g>
              <ellipse cx="48" cy="63" rx="2.8" ry="3.4" fill="#1f1a14"/>
              <ellipse cx="72" cy="63" rx="2.8" ry="3.4" fill="#1f1a14"/>
              <circle cx="49" cy="62" r="0.8" fill="#fff"/>
              <circle cx="73" cy="62" r="0.8" fill="#fff"/>
            </g>
          )}
        </g>

        {/* ============ Props (outside breathe group) ============ */}
        {state === 'sleeping' && (
          <g className="zzz" fontFamily="'Pretendard Variable', system-ui, sans-serif">
            <text className="z z1" x="100" y="42" fontSize="13" fontWeight="800" fill="#94a0ad">z</text>
            <text className="z z2" x="110" y="28" fontSize="10" fontWeight="800" fill="#94a0ad">z</text>
            <text className="z z3" x="118" y="18" fontSize="8" fontWeight="800" fill="#94a0ad">z</text>
          </g>
        )}

        {state === 'watching' && (
          <g className="chart">
            <line x1="102" y1="46" x2="102" y2="72" stroke="#cbd2da" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="102" y1="72" x2="134" y2="72" stroke="#cbd2da" strokeWidth="1.2" strokeLinecap="round"/>
            <rect className="bar bar1" x="106" y="62" width="5" height="10" rx="1" fill="#ed781f"/>
            <rect className="bar bar2" x="115" y="56" width="5" height="16" rx="1" fill="#ed781f"/>
            <rect className="bar bar3" x="124" y="50" width="5" height="22" rx="1" fill="#1763d6"/>
          </g>
        )}

        {state === 'organizing' && (
          <g className="clipboard">
            <rect x="100" y="40" width="30" height="36" rx="3" fill="#fff" stroke="#1f1a14" strokeWidth="1.8"/>
            <rect x="110" y="36" width="10" height="6" rx="1.5" fill="#cbd2da" stroke="#1f1a14" strokeWidth="1.5"/>
            <line className="cb-line cb-l1" x1="105" y1="50" x2="119" y2="50"
                  stroke="#cbd2da" strokeWidth="1.6" strokeLinecap="round"/>
            <line className="cb-line cb-l2" x1="105" y1="57" x2="125" y2="57"
                  stroke="#cbd2da" strokeWidth="1.6" strokeLinecap="round"/>
            <line className="cb-line cb-l3" x1="105" y1="64" x2="116" y2="64"
                  stroke="#cbd2da" strokeWidth="1.6" strokeLinecap="round"/>
            <g className="pencil">
              <line x1="116" y1="64" x2="130" y2="50" stroke="#ed781f" strokeWidth="3.2"
                    strokeLinecap="round"/>
              <circle cx="115.5" cy="64.5" r="1.6" fill="#1f1a14"/>
              <circle cx="131" cy="49" r="1.4" fill="#ffd4cc"/>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

Object.assign(window, { Cow });
