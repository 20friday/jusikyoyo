// TED PICK — 오늘 PICK 준비중 카드 showcase
const { useState } = React;

// ------- Time-band copy spec (5단계) -------
const BANDS = {
  dawn: {
    key: 'dawn',
    range: '00:00 — 06:00',
    short: '새벽',
    cowState: 'sleeping',
    statusLabel: '오늘 업데이트 예정',
    title: '오늘의 PICK은 잠시 쉬어가고 있어요',
    desc: '밤사이 주요 이슈를 정리해, 장이 시작되면 다시 시장 흐름을 확인할게요.',
    eta: '오전 중 다시 확인',
  },
  premarket: {
    key: 'premarket',
    range: '06:00 — 09:00',
    short: '개장 전',
    cowState: 'watching',
    statusLabel: '개장 전 체크 중',
    title: '개장 전 이슈를 살펴보고 있어요',
    desc: '밤사이 글로벌 시장과 주요 뉴스를 확인하며 오늘의 PICK을 준비하고 있어요.',
    eta: '오전 업데이트 예정',
  },
  earlymarket: {
    key: 'earlymarket',
    range: '09:00 — 11:30',
    short: '장 초반',
    cowState: 'watching',
    statusLabel: '시장 확인 중',
    title: '장 초반 흐름을 확인하고 있어요',
    desc: '시장 방향과 주요 섹터 움직임을 살펴보며 오늘의 PICK에 담을 내용을 정리하고 있어요.',
    eta: '오후 업데이트 예정',
  },
  midday: {
    key: 'midday',
    range: '11:30 — 13:30',
    short: '오전장 마감',
    cowState: 'organizing',
    statusLabel: '오전장 정리 중',
    title: '오전장 흐름을 정리하고 있어요',
    desc: '오전장 흐름과 주요 종목 움직임을 확인하며 오늘의 핵심 포인트를 추려보고 있어요.',
    eta: '오후 업데이트 예정',
  },
  afternoon: {
    key: 'afternoon',
    range: '13:30 — 발행 전',
    short: '오후',
    cowState: 'organizing',
    statusLabel: '곧 업데이트 예정',
    title: '오늘의 PICK을 정리하고 있어요',
    desc: '주요 방송과 시장 이슈를 확인하고, 핵심 종목과 섹터 흐름을 정리하고 있어요.',
    eta: '오늘 중 발행',
  },
};

const ClockIcon = () => (
  <svg className="prep-eta-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v5l3 2"/>
  </svg>
);

// ------- The PrepCard component (variants) -------
function PrepCard({ variant = 'a', band = 'afternoon' }) {
  const b = BANDS[band];
  return (
    <div className={`prep variant-${variant}`}>
      <div className="prep-status">
        <span className="prep-dot" />
        {b.statusLabel}
      </div>

      <h3 className="prep-title">{b.title}</h3>
      <p className="prep-desc">{b.desc}</p>

      {variant === 'c' && (
        <div className="prep-timeline">
          {[
            { label: '새벽', state: b.key === 'dawn' ? 'now' : 'done' },
            { label: '오전', state: b.key === 'morning' ? 'now' : (b.key === 'dawn' ? '' : 'done') },
            { label: '오후', state: b.key === 'afternoon' ? 'now' : '' },
            { label: '발행', state: '' },
          ].map((s, i) => (
            <div key={i} className={`pt-step ${s.state}`}>
              <div className="pt-bar" />
              <div className="pt-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {variant === 'd' && (
        <div className="prep-glimpse" aria-hidden="true">
          <div className="glimpse-show" />
          <div className="glimpse-line w-90" />
          <div className="glimpse-line w-70" />
        </div>
      )}

      <div className="prep-foot">
        <span className="prep-eta">
          <ClockIcon />
          {b.eta}
        </span>
        <button className="prep-cta" type="button">
          최근 PICK 먼저 보기 <span className="prep-cta-arrow">→</span>
        </button>
      </div>
    </div>
  );
}

// Variant E uses a different layout: cow mascot + text side-by-side
function PrepCardCow({ band = 'afternoon' }) {
  const b = BANDS[band];
  const cowState = b.cowState;
  return (
    <div className="prep variant-e">
      <div className="prep-cow-slot">
        <Cow state={cowState} size={96} />
      </div>
      <div className="prep-text">
        <div className="prep-status">
          <span className="prep-dot" />
          {b.statusLabel}
        </div>
        <h3 className="prep-title">{b.title}</h3>
        <p className="prep-desc">{b.desc}</p>
      </div>
      <div className="prep-foot">
        <span className="prep-eta">
          <ClockIcon />
          {b.eta}
        </span>
        <button className="prep-cta" type="button">
          최근 PICK 먼저 보기 <span className="prep-cta-arrow">→</span>
        </button>
      </div>
    </div>
  );
}

// Dispatcher
function PrepAny({ variant, band }) {
  if (variant === 'e') return <PrepCardCow band={band} />;
  return <PrepCard variant={variant} band={band} />;
}

// ------- A faux feed (mobile) with the card slotted at top of today section -------
function FeedMock({ variant, band, onBandChange }) {
  return (
    <div className="feed-mock">
      <div className="band-switcher" role="tablist" aria-label="시간대 미리보기">
        <span className="bs-label">시간대</span>
        {Object.values(BANDS).map((b) => (
          <button key={b.key}
            className={band === b.key ? 'active' : ''}
            onClick={() => onBandChange(b.key)}>
            {b.short}
          </button>
        ))}
      </div>

      <div className="feed-heading">오늘의 주식 방송 PICK</div>
      <div className="feed-sub">방송마다 흩어진 종목·섹터·시장 이슈를 쉽게 정리해드려요.</div>

      <div className="feed-filters">
        <button className="filter-btn active">전체</button>
        <button className="filter-btn">12시에 만나요</button>
        <button className="filter-btn">삼프로TV</button>
        <button className="filter-btn">한국경제TV</button>
      </div>

      {/* Today section — prep card replaces empty state */}
      <div className="date-divider--today">
        <span className="date-divider-label">오늘의 PICK</span>
      </div>
      <PrepAny variant={variant} band={band} />

      {/* Yesterday */}
      <div className="date-divider">
        <span className="date-divider-label">2026년 5월 19일 (화)</span>
      </div>
      <div className="post-card-mock">
        <div className="pcm-meta">
          <span className="pcm-show">12시에 만나요</span>
          <span className="pcm-dot" />
          <span className="pcm-date">어제</span>
        </div>
        <div className="pcm-title">반도체 숨고르기, 자금은 조선·로봇으로 이동했어요</div>
        <div className="pcm-sum">코스피는 7,820선에서 보합. 외국인이 반도체에서 조선으로 갈아탄 하루였어요.</div>
      </div>
      <div className="post-card-mock">
        <div className="pcm-meta">
          <span className="pcm-show">삼프로TV</span>
          <span className="pcm-dot" />
          <span className="pcm-date">어제</span>
        </div>
        <div className="pcm-title">엔비디아 실적 대기 모드 — 단기 변동성 주의</div>
        <div className="pcm-sum">미국장도 엔비디아 실적 발표 전까지 관망세가 이어지고 있어요.</div>
      </div>
    </div>
  );
}

// ------- Per-band artboard column (one variant × 3 bands) -------
function VariantColumn({ variant, label, description, accent }) {
  return (
    <DCSection
      id={`variant-${variant}`}
      title={label}
      subtitle={description}
    >
      {['dawn', 'morning', 'afternoon'].map((band) => {
        const b = BANDS[band];
        return (
          <DCArtboard
            key={band}
            id={`${variant}-${band}`}
            label={`${b.short} · ${b.range}`}
            width={440}
            height={variant === 'd' ? 340 : (variant === 'c' ? 310 : (variant === 'e' ? 280 : 250))}
          >
            <div style={{ padding: 16, background: 'var(--bg)', height: '100%' }}>
              <PrepAny variant={variant} band={band} />
            </div>
          </DCArtboard>
        );
      })}
    </DCSection>
  );
}

// ------- Top-level showcase -------
function App() {
  const [feedBand, setFeedBand] = useState('afternoon');
  const [feedVariant, setFeedVariant] = useState('b');

  return (
    <DesignCanvas
      title="오늘 PICK 준비중 카드"
      subtitle="오늘 날짜 피드가 등록되기 전, 메인피드 최상단에 노출되는 상태 카드. 시간대별로 메시지가 바뀝니다."
    >
      <VariantColumn
        variant="a"
        label="A · 차분한 안내"
        description="기존 post-card와 가장 자연스럽게 어울리는 기본 스타일. 회색 펄스 도트."
      />
      <VariantColumn
        variant="b"
        label="B · 오렌지 펄스 (추천)"
        description="브랜드 컬러와 가볍게 연결. ‘살아있다’는 신호를 가장 분명하게."
      />
      <VariantColumn
        variant="c"
        label="C · 진행 타임라인"
        description="새벽 → 오전 → 오후 → 발행. 운영 리듬을 시각적으로 드러내 신뢰감을 더함."
      />
      <VariantColumn
        variant="d"
        label="D · 살짝 비친 카드"
        description="오늘 글이 들어올 자리를 점선 박스 + 스켈레톤으로 미리 보여줘 ‘준비중’임을 직관화."
      />
      <VariantColumn
        variant="e"
        label="E · 소 캐릭터 마스켟"
        description="새벽엔 자고, 오전엔 시장을 보고, 오후엔 정리해요. 운영 리듬이 주는 친근감."
      />

      <DCSection
        id="in-feed"
        title="피드 안에 배치된 모습"
        subtitle="모바일 440 너비. 위 칩으로 시간대를 바꿔보고, 사용하고 싶은 변형을 비교해보세요."
      >
        {['a','b','c','d','e'].map((v) => (
          <DCArtboard
            key={v}
            id={`feed-${v}`}
            label={`Feed × Variant ${v.toUpperCase()}`}
            width={440}
            height={820}
          >
            <FeedMockHost variant={v} />
          </DCArtboard>
        ))}
      </DCSection>
    </DesignCanvas>
  );
}

// Per-artboard band state, so each feed mock is independently switchable
function FeedMockHost({ variant }) {
  const [band, setBand] = useState('afternoon');
  return <FeedMock variant={variant} band={band} onBandChange={setBand} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
