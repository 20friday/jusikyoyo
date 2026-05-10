// 주식요약 — main app (React)
const { useState, useEffect, useMemo } = React;

// ============= ICONS =============
const Icon = {
  search: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>),
  heart: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.5-9C.8 8.7 2.2 5 5.5 5c1.9 0 3.4 1 4.5 2.4C11.1 6 12.6 5 14.5 5 17.8 5 19.2 8.7 17.5 12 15 16.5 12 21 12 21z"/></svg>),
  chevronLeft: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>),
  share: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>),
  copy: () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>),
};

// ============= HEADER =============
function Header({ go, route, search, setSearch }) {
  return (
    <header className="hdr">
      <div className="hdr-inner">
        <div className="brand" onClick={() => go({ name: "feed" })}>
          <div className="brand-mark">주</div>
          <div>
            <div className="brand-name">주식요약</div>
          </div>
        </div>
        <div className="hdr-spacer" />
        {route.name === "feed" && (
          <div className="hdr-search">
            <Icon.search />
            <input
              placeholder="종목·키워드 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        <button className="btn-donate" onClick={() => go({ name: "donate" })}>
          <Icon.heart /> 후원
        </button>
      </div>
    </header>
  );
}

// ============= FEED =============
function IndexChip({ idx }) {
  const arrow = idx.dir === "up" ? "▲" : idx.dir === "down" ? "▼" : "•";
  return (
    <span className={`idx-chip ${idx.dir}`}>
      <span className="idx-name">{idx.name}</span>
      <span className="idx-val">{idx.value}</span>
      <span className="idx-chg">{arrow} {idx.change}</span>
    </span>
  );
}

function FeedCard({ post, onClick }) {
  return (
    <article className="feed-card" onClick={onClick}>
      <div className="feed-meta">
        <span className="show-pill">{post.show}</span>
        <span>{post.dateLong}</span>
        {post.hosts && <span>· {post.hosts.join(" · ")}</span>}
      </div>
      <h2 className="feed-title">{post.title}</h2>
      <p className="feed-summary">{post.summary}</p>
    </article>
  );
}

function HeroBanner({ variant }) {
  if (variant !== "bold") return null;
  return (
    <div className="hero-banner">
      <h2>매일 12시 장 마감 30분 전, 시장의 핵심을 정리합니다</h2>
      <p>방송을 보고 정리한 내용을 매일 무료로 올려요. 한 편당 약 2시간이 걸려요.</p>
    </div>
  );
}

function Sidebar({ posts, go }) {
  const latest = posts[0];
  const upStocks = useMemo(() => {
    const all = [];
    posts.forEach(p => p.sectors?.forEach(s => s.stocks?.forEach(st => {
      if (st.dir === "up") all.push({ ...st, postId: p.id });
    })));
    return all.slice(0, 5);
  }, [posts]);
  const downStocks = useMemo(() => {
    const all = [];
    posts.forEach(p => p.sectors?.forEach(s => s.stocks?.forEach(st => {
      if (st.dir === "down") all.push({ ...st, postId: p.id });
    })));
    return all.slice(0, 3);
  }, [posts]);

  return (
    <aside className="sidebar">
      <div className="side-card side-donate">
        <h4>후원하기</h4>
        <p>방송을 정리하는 데 매일 약 2시간이 걸려요. 응원해 주시면 큰 힘이 됩니다.</p>
        <button className="btn" onClick={() => go({ name: "donate" })}>후원 계좌 보기</button>
      </div>

      <div className="side-card">
        <h4>오늘의 강세 종목</h4>
        <div className="tag-list">
          {upStocks.map((s, i) => (
            <div key={i} className="tag-row up">
              <span className="tag-name">{s.name}</span>
              <span className="tag-val">{s.change}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="side-card">
        <h4>오늘의 약세 종목</h4>
        <div className="tag-list">
          {downStocks.map((s, i) => (
            <div key={i} className="tag-row down">
              <span className="tag-name">{s.name}</span>
              <span className="tag-val">{s.change}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="side-card">
        <h4>다가오는 일정</h4>
        <div className="tag-list">
          {(latest?.schedule || []).slice(0, 4).map((ev, i) => (
            <div key={i} className="tag-row">
              <span className="tag-name">{ev.event}</span>
              <span className="tag-val" style={{ color: "var(--toss-text-3)", fontSize: 13 }}>{ev.date}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function FeedPage({ posts, go, variant, isPatron, setIsPatron, showPremium }) {
  const [search, setSearch] = useState("");
  const [broadcast, setBroadcast] = useState("all");
  const filtered = posts.filter(p => {
    if (broadcast !== "all" && p.show !== broadcast) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const hay = [p.title, p.summary, ...(p.sectors?.map(s => s.name) || []),
      ...(p.sectors?.flatMap(s => s.stocks?.map(st => st.name) || []) || [])].join(" ").toLowerCase();
    return hay.includes(q);
  });
  const report = window.PREMIUM_REPORTS?.[0];

  return (
    <>
      <Header go={go} route={{ name: "feed" }} search={search} setSearch={setSearch} />
      <main className="page">
        <div className="feed-col">
          <HeroBanner variant={variant} />
          <h1 className="feed-h1">매일 12시, 장 정리</h1>
          <p className="feed-sub">방송을 보고 핵심만 추려서 올려요. 최신글이 위에 있어요.</p>

          {report && showPremium && <PremiumReportCard report={report} isPatron={isPatron} setIsPatron={setIsPatron} go={go} />}

          <div className="broadcast-tabs">
            {window.BROADCASTS.map(b => (
              <button key={b.id} className={`broadcast-tab ${broadcast === b.id ? "active" : ""}`}
                onClick={() => setBroadcast(b.id)}>{b.name}</button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="feed-card" style={{ textAlign: "center", color: "var(--toss-text-3)" }}>
              해당하는 글이 없어요.
            </div>
          ) : filtered.map(p => (
            <FeedCard key={p.id} post={p} onClick={() => go({ name: "post", id: p.id })} />
          ))}
        </div>
        <Sidebar posts={posts} go={go} />
      </main>
    </>
  );
}

function PremiumReportCard({ report, isPatron, setIsPatron, go }) {
  return (
    <div className={`premium-card ${isPatron ? "unlocked" : "locked"}`}>
      <div className="premium-head">
        <div>
          <span className="premium-badge">PRO · 분석 리포트</span>
          <h2 className="premium-title">{report.title}</h2>
          <p className="premium-sub">{report.dateLong} · {report.summary}</p>
        </div>
        {!isPatron && <span className="premium-lock-icon">🔒</span>}
      </div>

      <div className="premium-body">
        <div className="premium-section-title">공통 언급 종목 (방송 수)</div>
        <div className="consensus-list">
          {report.consensus.map((c, i) => (
            <div key={i} className="consensus-row" onClick={() => isPatron && go({ name: "stock", symbol: c.name })}
              style={{ cursor: isPatron ? "pointer" : "default" }}>
              <div className="consensus-rank">{i + 1}</div>
              <div className="consensus-name">{c.name}</div>
              <div className={`consensus-sent ${c.sentiment === "긍정" ? "up" : c.sentiment === "부정" ? "down" : "flat"}`}>
                {c.sentiment}
              </div>
              <div className="consensus-mentions">{c.mentions}/5 방송</div>
              <div className="consensus-note">{c.note}</div>
            </div>
          ))}
        </div>

        <div className="premium-section-title" style={{ marginTop: 20 }}>방송 간 의견 차이</div>
        <div className="divergence-list">
          {report.divergence.map((d, i) => (
            <div key={i} className="divergence-row">
              <div className="divergence-topic">{d.topic}</div>
              <div className="divergence-views">
                <div className="dv up"><span>↑</span> {d.a}</div>
                <div className="dv down"><span>↓</span> {d.b}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!isPatron && (
        <div className="premium-overlay">
          <div className="premium-overlay-inner">
            <div className="premium-overlay-icon">🔒</div>
            <h3>후원자 전용 분석</h3>
            <p>여러 방송이 공통으로 언급한 종목과 의견 차이를 한 번에 볼 수 있어요.</p>
            <div className="premium-overlay-actions">
              <button className="btn-donate" onClick={() => go({ name: "donate" })}>후원하고 잠금 해제</button>
              <button className="btn-ghost" onClick={() => setIsPatron(true)}>이미 후원했어요</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============= DETAIL =============
function IndexCard({ idx }) {
  const arrow = idx.dir === "up" ? "▲" : idx.dir === "down" ? "▼" : "•";
  return (
    <div className={`idx-card ${idx.dir}`}>
      <div className="idx-card-name">{idx.name}</div>
      <div className="idx-card-val">{idx.value}</div>
      <div className="idx-card-chg">{arrow} {idx.change}</div>
      {idx.note && <div className="idx-card-note">{idx.note}</div>}
    </div>
  );
}

function SectorCard({ sector, onStock }) {
  const arrow = sector.dir === "up" ? "↑" : sector.dir === "down" ? "↓" : "→";
  return (
    <div className="sector-card">
      <div className="sector-head">
        <span className={`sector-arrow ${sector.dir}`}>{arrow}</span>
        <span className="sector-name">{sector.name}</span>
        {sector.tag && <span className="sector-tag-pill">{sector.tag}</span>}
      </div>
      {sector.headline && <div className="sector-headline">{sector.headline}</div>}
      {sector.body && <div className="sector-body">{sector.body}</div>}
      {sector.stocks && sector.stocks.length > 0 && (
        <div className="stock-list">
          {sector.stocks.map((s, i) => (
            <div key={i} className={`stock-row ${s.dir}${s.strong ? " strong" : ""}`}
              onClick={() => onStock && onStock(s.name)}
              style={{ cursor: onStock ? "pointer" : "default" }}>
              <span className="stock-name">{s.name}</span>
              <span className="stock-chg">{s.change}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DonateInline({ onShare, shared }) {
  const [copied, setCopied] = useState(false);
  const copyAccount = () => {
    const text = `${window.DONATION.bank} ${window.DONATION.account} ${window.DONATION.holder}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="donate-inline">
      <h3>오늘 정리가 도움이 되셨나요?</h3>
      <p>{window.DONATION.message}</p>
      <div className="donate-account">
        <span className="acc-bank">{window.DONATION.bank}</span>
        <span className="acc-num">{window.DONATION.account}</span>
        <span className="acc-bank">예금주 {window.DONATION.holder}</span>
        <button className={`donate-copy-btn ${copied ? "copied" : ""}`} onClick={copyAccount}>
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <div className="share-row" style={{ justifyContent: "center", borderTop: "none", paddingTop: 0 }}>
        <button className={`share-btn ${shared ? "copied" : ""}`} onClick={onShare}>
          <Icon.share /> {shared ? "링크 복사됨" : "공유하기"}
        </button>
      </div>
    </div>
  );
}

function PostPage({ post, go, variant }) {
  const [shared, setShared] = useState(false);

  const onShare = () => {
    navigator.clipboard?.writeText(`${window.location.href}#${post.id}`);
    setShared(true);
    setTimeout(() => setShared(false), 1800);
  };

  const arrow = (d) => d === "up" ? "▲" : d === "down" ? "▼" : "•";
  const dirCls = (d) => d === "up" ? "up" : d === "down" ? "down" : "flat";

  return (
    <>
      <Header go={go} route={{ name: "post" }} search="" setSearch={() => {}} />
      <main className="page-narrow editor">
        <button className="detail-back" onClick={() => go({ name: "feed" })}>
          <Icon.chevronLeft /> 전체 글 보기
        </button>
        <div className="ed-meta">
          <span className="ed-show">{post.show}</span>
          <span>·</span>
          <span>{post.dateLong}</span>
          {post.hosts && <><span>·</span><span>{post.hosts.join(", ")}</span></>}
        </div>
        <h1 className="ed-h1">{post.title}</h1>
        <p className="ed-lede">{post.summary}</p>

        <hr className="ed-hr" />

        {post.indices && post.indices.length > 0 && (
          <section className="ed-section">
            <h2 className="ed-h2"><span className="ed-emo">📊</span> 오늘의 시황</h2>
            {post.marketBody && <p className="ed-p">{post.marketBody}</p>}
            <table className="ed-table">
              <thead>
                <tr><th>지수</th><th>수치</th><th>흐름</th></tr>
              </thead>
              <tbody>
                {post.indices.map((idx, i) => (
                  <tr key={i}>
                    <td>{idx.name}</td>
                    <td className="ed-tnum">{idx.value}</td>
                    <td className={`ed-flow ${dirCls(idx.dir)}`}>
                      <span className="ed-arrow-inline">{arrow(idx.dir)}</span> {idx.note || idx.change}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {post.sectors && post.sectors.length > 0 && (
          <section className="ed-section">
            <h2 className="ed-h2"><span className="ed-emo">📌</span> 섹터별 동향</h2>
            {post.sectors.map((s, i) => (
              <div key={i} className="ed-sector">
                <h3 className="ed-h3">
                  <span className={`ed-arrow ${dirCls(s.dir)}`}>{arrow(s.dir)}</span>
                  {s.name}
                  {s.tag && <span className="ed-tag">— {s.tag}</span>}
                </h3>
                {s.headline && <p className="ed-p ed-headline">{s.headline}</p>}
                {s.body && <p className="ed-p">{s.body}</p>}
                {s.stocks && s.stocks.length > 0 && (
                  <ul className="ed-stocks">
                    {s.stocks.map((st, j) => (
                      <li key={j} onClick={() => go({ name: "stock", symbol: st.name })}>
                        <span className="ed-stock-name">{st.name}</span>
                        <span className={`ed-stock-chg ${dirCls(st.dir)}`}>{st.change}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {post.news && post.news.length > 0 && (
          <section className="ed-section">
            <h2 className="ed-h2"><span className="ed-emo">🌍</span> 주요 뉴스 &amp; 이슈</h2>
            {post.news.map((n, i) => (
              <div key={i} className="ed-news">
                <h3 className="ed-h3">{n.title}</h3>
                <p className="ed-p">{n.body}</p>
              </div>
            ))}
          </section>
        )}

        {post.schedule && post.schedule.length > 0 && (
          <section className="ed-section">
            <h2 className="ed-h2"><span className="ed-emo">📅</span> 앞으로의 일정</h2>
            <ul className="ed-sched">
              {post.schedule.map((ev, i) => (
                <li key={i} className={ev.highlight ? "highlight" : ""}>
                  <span className="ed-sched-date">{ev.date}</span>
                  <span className="ed-sched-event">{ev.event}</span>
                  <span className="ed-sched-why">— {ev.why}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {post.warningStocks && post.warningStocks.length > 0 && (
          <section className="ed-section">
            <h2 className="ed-h2"><span className="ed-emo">⚠️</span> 레버리지 ETF 주의사항</h2>
            <p className="ed-p">5/21 삼성전자·SK하이닉스 단일 레버리지 ETF 상장. 이미 반도체를 많이 갖고 있는 분들은 굳이 추가로 살 필요 없어요. 아래 종목들은 ETF에서 자금이 빠져나올 때 같이 흔들릴 수 있으니 주의하세요.</p>
            <p className="ed-p ed-warning-list">{post.warningStocks.join(" · ")}</p>
          </section>
        )}

        {post.classroom && post.classroom.length > 0 && (
          <section className="ed-section">
            <h2 className="ed-h2"><span className="ed-emo">📚</span> 방과후 경제교실</h2>
            {post.classroom.map((c, i) => (
              <div key={i} className="ed-classroom">
                <h3 className="ed-h3">{c.topic} <span className="ed-host-name">— {c.host}</span></h3>
                <p className="ed-p">{c.body}</p>
                {c.quote && <blockquote className="ed-quote">"{c.quote}"</blockquote>}
              </div>
            ))}
          </section>
        )}

        <DonateInline onShare={onShare} shared={shared} />
      </main>
    </>
  );
}

// ============= DONATE PAGE =============
function DonatePage({ go, setIsPatron }) {
  const [copied, setCopied] = useState(false);
  const copyAccount = () => {
    navigator.clipboard?.writeText(`${window.DONATION.bank} ${window.DONATION.account} ${window.DONATION.holder}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <>
      <Header go={go} route={{ name: "donate" }} search="" setSearch={() => {}} />
      <main className="page-narrow">
        <button className="detail-back" onClick={() => go({ name: "feed" })}>
          <Icon.chevronLeft /> 전체 글 보기
        </button>
        <div className="donate-hero">
          <h1>응원해 주셔서 고맙습니다 💙</h1>
          <p>{window.DONATION.message}<br/><br/>커피 한 잔이라도 큰 힘이 돼요. 후원해 주신 분들 덕분에 앞으로도 매일 정리해서 올릴 수 있어요.</p>
        </div>
        <div className="donate-detail-card">
          <h2 className="section-title" style={{ marginBottom: 8 }}>후원 계좌</h2>
          <p className="body-md" style={{ color: "var(--toss-text-2)", margin: "0 0 8px" }}>아래 계좌로 자유롭게 보내주세요.</p>
          <div className="donate-row">
            <span className="lbl">은행</span>
            <span className="val">{window.DONATION.bank}</span>
          </div>
          <div className="donate-row">
            <span className="lbl">계좌번호</span>
            <span className="val">{window.DONATION.account}</span>
          </div>
          <div className="donate-row">
            <span className="lbl">예금주</span>
            <span className="val">{window.DONATION.holder}</span>
          </div>
          <div style={{ marginTop: 24, display: "flex", gap: 8, flexDirection: "column" }}>
            <button className={`btn-donate ${copied ? "copied" : ""}`} onClick={copyAccount} style={{ width: "100%", justifyContent: "center", padding: "14px" }}>
              <Icon.copy /> {copied ? "복사 완료!" : "계좌번호 복사"}
            </button>
            <button onClick={() => { setIsPatron && setIsPatron(true); go({ name: "feed" }); }}
              style={{ width: "100%", padding: "14px", borderRadius: 10, background: "var(--toss-bg)", color: "var(--toss-text-2)", fontWeight: 700, fontSize: 14 }}>
              후원 완료했어요 → 분석 리포트 보기
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

// ============= STOCK PAGE =============
function StockPage({ symbol, go }) {
  const mentions = window.STOCK_MENTIONS?.[symbol] || [];
  const ups = mentions.filter(m => m.dir === "up").length;
  const downs = mentions.filter(m => m.dir === "down").length;
  const net = ups - downs;
  const sentiment = net > 0 ? "긍정 우세" : net < 0 ? "부정 우세" : "혼조";
  const sentDir = net > 0 ? "up" : net < 0 ? "down" : "flat";

  return (
    <>
      <Header go={go} route={{ name: "stock" }} search="" setSearch={() => {}} />
      <main className="page-narrow">
        <button className="detail-back" onClick={() => go({ name: "feed" })}>
          <Icon.chevronLeft /> 전체 글 보기
        </button>
        <div className="detail-meta">
          <span className="show-pill">종목</span>
          <span>최근 방송 언급</span>
        </div>
        <h1 className="detail-h1">{symbol}</h1>
        <div className="stock-summary-row">
          <div className={`stock-summary-card ${sentDir}`}>
            <div className="ssc-label">최근 톤</div>
            <div className="ssc-val">{sentiment}</div>
          </div>
          <div className="stock-summary-card up">
            <div className="ssc-label">긍정 언급</div>
            <div className="ssc-val">{ups}건</div>
          </div>
          <div className="stock-summary-card down">
            <div className="ssc-label">부정 언급</div>
            <div className="ssc-val">{downs}건</div>
          </div>
        </div>

        <section className="section">
          <h2 className="section-title"><span className="emoji">🎙</span> 방송별 언급</h2>
          {mentions.length === 0 ? (
            <div className="news-card" style={{ textAlign: "center", color: "var(--toss-text-3)" }}>
              아직 정리된 언급이 없어요.
            </div>
          ) : mentions.map((m, i) => {
            const post = window.POSTS.find(p => p.id === m.postId);
            return (
              <div key={i} className={`mention-card ${m.dir}`} onClick={() => post && go({ name: "post", id: m.postId })}>
                <div className="mention-meta">
                  <span className="show-pill">{m.show}</span>
                  <span>{post?.dateLong || ""}</span>
                  <span className={`mention-dir ${m.dir}`}>{m.dir === "up" ? "▲ 긍정" : m.dir === "down" ? "▼ 부정" : "• 중립"}</span>
                </div>
                <div className="mention-quote">"{m.quote}"</div>
                {post && <div className="mention-post-title">→ {post.title}</div>}
              </div>
            );
          })}
        </section>
      </main>
    </>
  );
}

// ============= FOOTER =============
function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <div className="brand-mark">주</div>
          <span className="brand-name">주식요약</span>
        </div>
        <p className="footer-disclaimer">
          본 사이트는 외부 경제 방송의 내용을 자체적으로 요약·재구성한 정보를 제공합니다.
          <strong> 모든 콘텐츠는 정보 제공 목적이며, 특정 종목의 매수·매도를 권유하지 않습니다.</strong>
          최종 투자 판단과 책임은 투자자 본인에게 있으며, 본 사이트는 투자 결과에 대해 어떠한 책임도 지지 않습니다.
          본 서비스는 「자본시장과 금융투자업에 관한 법률」상 투자자문업·투자일임업에 해당하지 않습니다.
        </p>
        <div className="footer-meta">© 2026 주식요약 · 문의 hello@example.com</div>
      </div>
    </footer>
  );
}

// ============= APP =============
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "variant": "feed",
  "siteName": "주식요약",
  "showPremium": false
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [route, setRoute] = useState({ name: "feed" });
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [isPatron, setIsPatron] = useState(() => localStorage.getItem("isPatron") === "1");
  useEffect(() => { localStorage.setItem("isPatron", isPatron ? "1" : "0"); }, [isPatron]);

  // Tweaks bridge
  useEffect(() => {
    const handler = (e) => {
      const d = e.data || {};
      if (d.type === "__activate_edit_mode") setTweaksOpen(true);
      if (d.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  const setTweak = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*");
  };
  const closeTweaks = () => {
    setTweaksOpen(false);
    window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*");
  };

  const go = (r) => { setRoute(r); window.scrollTo({ top: 0, behavior: "instant" }); };

  const post = route.name === "post" ? window.POSTS.find(p => p.id === route.id) : null;

  return (
    <div className="app" data-variant={tweaks.variant}>
      {route.name === "feed" && <FeedPage posts={window.POSTS} go={go} variant={tweaks.variant} isPatron={isPatron} setIsPatron={setIsPatron} showPremium={tweaks.showPremium} />}
      {route.name === "post" && post && <PostPage post={post} go={go} variant={tweaks.variant} />}
      {route.name === "donate" && <DonatePage go={go} setIsPatron={setIsPatron} />}
      {route.name === "stock" && <StockPage symbol={route.symbol} go={go} />}
      <Footer />

      {tweaksOpen && (
        <div className="tweaks-panel">
          <div className="tweaks-head">
            <span>Tweaks</span>
            <button onClick={closeTweaks}>✕</button>
          </div>
          <div className="tweaks-section">
            <div className="tweaks-label">레이아웃</div>
            <div className="tweaks-radio">
              <button className={tweaks.variant === "feed" ? "active" : ""} onClick={() => setTweak("variant", "feed")}>피드</button>
              <button className={tweaks.variant === "bold" ? "active" : ""} onClick={() => setTweak("variant", "bold")}>홈+히어로</button>
            </div>
          </div>
          <div className="tweaks-section">
            <div className="tweaks-label">현재 화면</div>
            <div className="tweaks-radio">
              <button className={route.name === "feed" ? "active" : ""} onClick={() => go({ name: "feed" })}>목록</button>
              <button className={route.name === "post" ? "active" : ""} onClick={() => go({ name: "post", id: window.POSTS[0].id })}>상세</button>
              <button className={route.name === "stock" ? "active" : ""} onClick={() => go({ name: "stock", symbol: "현대모비스" })}>종목</button>
              <button className={route.name === "donate" ? "active" : ""} onClick={() => go({ name: "donate" })}>후원</button>
            </div>
          </div>
          <div className="tweaks-section">
            <div className="tweaks-label">분석 리포트 카드</div>
            <div className="tweaks-radio">
              <button className={!tweaks.showPremium ? "active" : ""} onClick={() => setTweak("showPremium", false)}>숨김</button>
              <button className={tweaks.showPremium ? "active" : ""} onClick={() => setTweak("showPremium", true)}>표시</button>
            </div>
          </div>
          <div className="tweaks-section">
            <div className="tweaks-label">후원자 모드 (분석 잠금 해제)</div>
            <div className="tweaks-radio">
              <button className={!isPatron ? "active" : ""} onClick={() => setIsPatron(false)}>잠금</button>
              <button className={isPatron ? "active" : ""} onClick={() => setIsPatron(true)}>해제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
