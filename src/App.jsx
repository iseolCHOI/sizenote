import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { subscribeGarments, saveGarment, deleteGarment } from "./data";

// ── SizeNote ─────────────────────────────────────────────
// 옷 사이즈 기록 & 비교 웹앱
// 쇼핑몰이 제공한 실측 치수를 기록하고, 착용 후기와 함께 저장.
// 새 옷을 살 때 치수를 입력하면 '잘 맞았던' 기록과 자동 비교.
// 데이터는 Firebase Firestore에 사용자별로 저장됩니다.
// ─────────────────────────────────────────────────────────

const CATEGORIES = {
  top: {
    label: "상의",
    icon: "▤",
    fields: [
      { key: "shoulder", label: "어깨너비" },
      { key: "chest", label: "가슴단면" },
      { key: "sleeve", label: "소매길이" },
      { key: "length", label: "총장" },
    ],
  },
  bottom: {
    label: "하의",
    icon: "▥",
    fields: [
      { key: "waist", label: "허리단면" },
      { key: "hip", label: "엉덩이단면" },
      { key: "thigh", label: "허벅지단면" },
      { key: "hem", label: "밑단너비" },
      { key: "rise", label: "밑위" },
      { key: "inseam", label: "인심" },
      { key: "length", label: "총장" },
    ],
  },
  dress: {
    label: "원피스",
    icon: "▦",
    fields: [
      { key: "shoulder", label: "어깨너비" },
      { key: "chest", label: "가슴단면" },
      { key: "waist", label: "허리단면" },
      { key: "length", label: "총장" },
    ],
  },
  outer: {
    label: "아우터",
    icon: "▧",
    fields: [
      { key: "shoulder", label: "어깨너비" },
      { key: "chest", label: "가슴단면" },
      { key: "sleeve", label: "소매길이" },
      { key: "length", label: "총장" },
    ],
  },
};

const FITS = {
  perfect: { label: "딱 맞음", tone: "good" },
  loose: { label: "큼", tone: "warn" },
  tight: { label: "작음", tone: "bad" },
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ── photo → resized base64 ───────────────────────────────
const fileToThumb = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 600;
        let { width, height } = img;
        if (width > height && width > max) {
          height = (height * max) / width;
          width = max;
        } else if (height > max) {
          width = (width * max) / height;
          height = max;
        }
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        c.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL("image/jpeg", 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

export default function SizeNote() {
  const [user, setUser] = useState(undefined); // undefined=확인중, null=로그아웃, obj=로그인
  const [garments, setGarments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // list | add | compare
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);

  // 로그인 상태 감시
  useEffect(() => {
    // 리디렉션 로그인에서 돌아온 경우 결과를 처리 (오류는 조용히 무시)
    getRedirectResult(auth).catch(() => {});
    return onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      if (!u) {
        setGarments([]);
        setLoading(false);
      }
    });
  }, []);

  // 로그인되면 내 기록을 실시간 구독 (기기 간 자동 동기화)
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = subscribeGarments(user.uid, (items) => {
      setGarments(items);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const upsert = async (g) => {
    await saveGarment(user.uid, g);
    setView("list");
    setEditing(null);
  };
  const del = async (id) => {
    await deleteGarment(user.uid, id);
  };

  const filtered = useMemo(
    () => (filter === "all" ? garments : garments.filter((g) => g.category === filter)),
    [garments, filter]
  );

  const perfectCount = garments.filter((g) => g.fit === "perfect").length;

  // 로그인 확인 중
  if (user === undefined) {
    return (
      <div className="sn">
        <style>{CSS}</style>
        <div className="sn-empty">불러오는 중…</div>
      </div>
    );
  }

  // 로그아웃 상태 → 로그인 화면
  if (user === null) {
    return <Login />;
  }

  return (
    <div className="sn">
      <style>{CSS}</style>

      <header className="sn-head">
        <div className="sn-brand">
          <span className="sn-mark">◇</span>
          <div>
            <h1>SizeNote</h1>
            <p>입어본 사이즈를 기억하는 옷장</p>
          </div>
        </div>
        <div className="sn-head-right">
          <div className="sn-stat">
            <span className="sn-stat-num">{garments.length}</span>
            <span className="sn-stat-lbl">기록</span>
            <span className="sn-stat-div" />
            <span className="sn-stat-num good">{perfectCount}</span>
            <span className="sn-stat-lbl">딱 맞음</span>
          </div>
          <button className="sn-signout" onClick={() => signOut(auth)} title="로그아웃">
            로그아웃
          </button>
        </div>
      </header>

      <nav className="sn-nav">
        <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
          내 옷장
        </button>
        <button
          className={view === "compare" ? "on" : ""}
          onClick={() => setView("compare")}
        >
          사이즈 비교
        </button>
        <button
          className="sn-add"
          onClick={() => {
            setEditing(null);
            setView("add");
          }}
        >
          + 기록
        </button>
      </nav>

      {loading ? (
        <div className="sn-empty">불러오는 중…</div>
      ) : view === "add" ? (
        <AddForm
          initial={editing}
          onSave={upsert}
          onCancel={() => {
            setView("list");
            setEditing(null);
          }}
        />
      ) : view === "compare" ? (
        <Compare garments={garments} />
      ) : (
        <List
          garments={filtered}
          filter={filter}
          setFilter={setFilter}
          onEdit={(g) => {
            setEditing(g);
            setView("add");
          }}
          onDelete={del}
          empty={garments.length === 0}
        />
      )}
    </div>
  );
}

// ── Login ────────────────────────────────────────────────
function Login() {
  const [error, setError] = useState("");

  // 아이폰/아이패드이거나 홈 화면 앱(전체화면)으로 열린 경우엔
  // 팝업이 자주 막히므로 리디렉션 방식으로 로그인합니다.
  const preferRedirect = () => {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isStandalone =
      window.navigator.standalone === true ||
      window.matchMedia?.("(display-mode: standalone)").matches;
    return isIOS || isStandalone;
  };

  const signIn = async () => {
    setError("");
    try {
      if (preferRedirect()) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user") {
        setError("로그인에 실패했어요. 잠시 후 다시 시도해주세요.");
      }
    }
  };
  return (
    <div className="sn">
      <style>{CSS}</style>
      <div className="sn-login">
        <span className="sn-login-mark">◇</span>
        <h1>SizeNote</h1>
        <p className="sn-login-sub">입어본 사이즈를 기억하는 옷장</p>
        <p className="sn-login-desc">
          구글 계정으로 로그인하면 어느 기기에서든 같은 기록을 볼 수 있어요.
        </p>
        <button className="sn-login-btn" onClick={signIn}>
          <span className="sn-g">G</span> 구글로 시작하기
        </button>
        {error && <p className="sn-login-err">{error}</p>}
      </div>
    </div>
  );
}

// ── List view ────────────────────────────────────────────
function List({ garments, filter, setFilter, onEdit, onDelete, empty }) {
  if (empty)
    return (
      <div className="sn-empty">
        <p className="sn-empty-big">아직 기록이 없어요</p>
        <p>쇼핑몰에서 본 실측 치수와 입어본 느낌을 + 기록 으로 남겨보세요.</p>
      </div>
    );

  return (
    <>
      <div className="sn-filter">
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
          전체
        </button>
        {Object.entries(CATEGORIES).map(([k, c]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="sn-grid">
        {garments.map((g) => (
          <Card key={g.id} g={g} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </>
  );
}

function Card({ g, onEdit, onDelete }) {
  const cat = CATEGORIES[g.category];
  const fit = FITS[g.fit];
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={`sn-card tone-${fit?.tone || ""}`}>
      {g.photo ? (
        <div className="sn-card-photo" style={{ backgroundImage: `url(${g.photo})` }} />
      ) : (
        <div className="sn-card-photo sn-card-noimg">{cat?.icon}</div>
      )}
      <div className="sn-card-body">
        <div className="sn-card-top">
          <span className="sn-card-cat">{cat?.label}</span>
          {fit && <span className={`sn-fit tone-${fit.tone}`}>{fit.label}</span>}
        </div>
        <h3>{g.brand || "이름 없음"}</h3>
        <p className="sn-card-sub">
          {g.product && <span>{g.product}</span>}
          {g.sizeLabel && <span className="sn-size">{g.sizeLabel}</span>}
        </p>
        <div className="sn-measure">
          {cat?.fields.map((f) =>
            g.measures?.[f.key] ? (
              <span key={f.key}>
                {f.label} <b>{g.measures[f.key]}</b>
              </span>
            ) : null
          )}
        </div>
        {g.note && <p className="sn-note">{g.note}</p>}
        <div className="sn-card-actions">
          {g.link && (
            <a
              className="sn-shop"
              href={g.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              상품 보기 ↗
            </a>
          )}
          <button onClick={() => onEdit(g)}>수정</button>
          {confirm ? (
            <>
              <button className="danger" onClick={() => onDelete(g.id)}>
                삭제할게요
              </button>
              <button onClick={() => setConfirm(false)}>취소</button>
            </>
          ) : (
            <button onClick={() => setConfirm(true)}>삭제</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add / Edit form ──────────────────────────────────────
function AddForm({ initial, onSave, onCancel }) {
  const [category, setCategory] = useState(initial?.category || "top");
  const [brand, setBrand] = useState(initial?.brand || "");
  const [product, setProduct] = useState(initial?.product || "");
  const [sizeLabel, setSizeLabel] = useState(initial?.sizeLabel || "");
  const [measures, setMeasures] = useState(initial?.measures || {});
  const [fit, setFit] = useState(initial?.fit || "");
  const [note, setNote] = useState(initial?.note || "");
  const [link, setLink] = useState(initial?.link || "");
  const [photo, setPhoto] = useState(initial?.photo || "");
  const fileRef = useRef();

  const cat = CATEGORIES[category];

  const setM = (k, v) => setMeasures((m) => ({ ...m, [k]: v }));

  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    if (f) setPhoto(await fileToThumb(f));
  };

  const submit = () => {
    if (!brand.trim() && !product.trim()) {
      alert("브랜드나 상품명 중 하나는 적어주세요.");
      return;
    }
    let url = link.trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    onSave({
      id: initial?.id || uid(),
      createdAt: initial?.createdAt || Date.now(),
      category,
      brand: brand.trim(),
      product: product.trim(),
      sizeLabel: sizeLabel.trim(),
      measures,
      fit,
      note: note.trim(),
      link: url,
      photo,
    });
  };

  return (
    <div className="sn-form">
      <h2>{initial ? "기록 수정" : "새 사이즈 기록"}</h2>

      <label className="sn-l">종류</label>
      <div className="sn-cat-pick">
        {Object.entries(CATEGORIES).map(([k, c]) => (
          <button
            key={k}
            className={category === k ? "on" : ""}
            onClick={() => setCategory(k)}
            type="button"
          >
            <span>{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="sn-row2">
        <div>
          <label className="sn-l">쇼핑몰 / 브랜드</label>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="예: 무신사 스탠다드" />
        </div>
        <div>
          <label className="sn-l">사이즈 표기</label>
          <input
            value={sizeLabel}
            onChange={(e) => setSizeLabel(e.target.value)}
            placeholder="예: M / 95 / 28"
          />
        </div>
      </div>

      <label className="sn-l">상품명 (선택)</label>
      <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="예: 릴렉스 핏 셔츠" />

      <label className="sn-l">상품 링크 (선택)</label>
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https:// 상품 페이지 주소 붙여넣기"
        type="url"
        inputMode="url"
      />

      <label className="sn-l">사이트 제공 실측 치수 (cm)</label>
      <div className="sn-measure-grid">
        {cat.fields.map((f) => (
          <div key={f.key} className="sn-mfield">
            <span>{f.label}</span>
            <input
              type="number"
              inputMode="decimal"
              value={measures[f.key] || ""}
              onChange={(e) => setM(f.key, e.target.value)}
              placeholder="0"
            />
          </div>
        ))}
      </div>

      <label className="sn-l">입어보니 어땠나요?</label>
      <div className="sn-fit-pick">
        {Object.entries(FITS).map(([k, f]) => (
          <button
            key={k}
            type="button"
            className={`${fit === k ? "on" : ""} tone-${f.tone}`}
            onClick={() => setFit(fit === k ? "" : k)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <label className="sn-l">메모 (선택)</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 어깨는 딱인데 기장이 살짝 길었음. 다음엔 S 고려."
      />

      <label className="sn-l">사진</label>
      <div className="sn-photo-pick">
        {photo ? (
          <div className="sn-photo-prev" style={{ backgroundImage: `url(${photo})` }}>
            <button type="button" onClick={() => setPhoto("")}>
              ✕
            </button>
          </div>
        ) : (
          <button type="button" className="sn-photo-add" onClick={() => fileRef.current?.click()}>
            ＋ 사진 추가
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
      </div>

      <div className="sn-form-actions">
        <button className="sn-secondary" onClick={onCancel} type="button">
          취소
        </button>
        <button className="sn-primary" onClick={submit} type="button">
          {initial ? "저장" : "기록하기"}
        </button>
      </div>
    </div>
  );
}

// ── Compare view ─────────────────────────────────────────
function Compare({ garments }) {
  const [category, setCategory] = useState("top");
  const [mode, setMode] = useState("pick"); // pick = 기록에서 고르기, manual = 직접 입력
  const [sourceId, setSourceId] = useState(""); // 고른 옷의 id
  const [input, setInput] = useState({}); // 직접 입력값
  const cat = CATEGORIES[category];

  // 같은 종류의 모든 기록 (기준으로 고를 수 있는 후보)
  const sameCategory = useMemo(
    () => garments.filter((g) => g.category === category),
    [garments, category]
  );

  const setM = (k, v) => setInput((m) => ({ ...m, [k]: v }));

  // 현재 비교에 쓸 치수(고른 옷의 치수 또는 직접 입력값)
  const source = useMemo(() => {
    if (mode === "pick") {
      const g = sameCategory.find((x) => x.id === sourceId);
      return g ? { measures: g.measures || {}, self: g } : null;
    }
    return { measures: input, self: null };
  }, [mode, sourceId, sameCategory, input]);

  const hasSource =
    source && cat.fields.some((f) => source.measures[f.key]);

  // 같은 종류로 등록된 모든 옷과 비교 (고른 옷 자신은 제외).
  // 각 항목마다 두 수치(mine/ref)와 차이를 함께 담습니다.
  const results = useMemo(() => {
    if (!hasSource) return [];
    return sameCategory
      .filter((ref) => ref.id !== source.self?.id)
      .map((ref) => {
        const diffs = cat.fields
          .map((f) => {
            const a = parseFloat(source.measures[f.key]);
            const b = parseFloat(ref.measures?.[f.key]);
            if (isNaN(a) || isNaN(b)) return null;
            return {
              field: f.label,
              mine: a,
              ref: b,
              diff: +(a - b).toFixed(1),
            };
          })
          .filter(Boolean);
        const score =
          diffs.length === 0
            ? Infinity
            : diffs.reduce((s, d) => s + Math.abs(d.diff), 0) / diffs.length;
        return { ref, diffs, score };
      })
      .filter((r) => r.diffs.length)
      .sort((a, b) => a.score - b.score);
  }, [sameCategory, source, cat, hasSource]);

  // 추천은 '딱 맞음'으로 기록한 옷 중 가장 비슷한 것에서만 뽑습니다.
  const best = useMemo(
    () => results.find((r) => r.ref.fit === "perfect"),
    [results]
  );
  const verdict = best
    ? best.score < 1.5
      ? { tone: "good", text: "잘 맞을 가능성이 높아요" }
      : best.score < 3
      ? { tone: "warn", text: "대체로 비슷하지만 약간 차이가 있어요" }
      : { tone: "bad", text: "꽤 차이가 있어요. 신중하게 보세요" }
    : null;

  const reset = () => {
    setSourceId("");
    setInput({});
  };

  return (
    <div className="sn-compare">
      <p className="sn-compare-intro">
        비교할 옷을 고르면, <b>딱 맞았다</b>고 기록한 옷들과 얼마나 비슷한지 따져보고 가장 잘 맞을 옷을 알려드려요.
      </p>

      <div className="sn-filter">
        {Object.entries(CATEGORIES).map(([k, c]) => (
          <button
            key={k}
            className={category === k ? "on" : ""}
            onClick={() => {
              setCategory(k);
              reset();
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {sameCategory.length < 2 ? (
        <div className="sn-empty">
          <p>이 종류에는 비교할 옷이 충분하지 않아요.</p>
          <p>같은 종류로 2개 이상 기록하면 서로 비교할 수 있어요.</p>
        </div>
      ) : (
        <>
          <div className="sn-mode">
            <button
              className={mode === "pick" ? "on" : ""}
              onClick={() => {
                setMode("pick");
                setInput({});
              }}
            >
              기록에서 고르기
            </button>
            <button
              className={mode === "manual" ? "on" : ""}
              onClick={() => {
                setMode("manual");
                setSourceId("");
              }}
            >
              직접 입력하기
            </button>
          </div>

          {mode === "pick" ? (
            <>
              <label className="sn-l">비교할 옷 고르기</label>
              {sameCategory.length === 0 ? (
                <p className="sn-hint">이 종류에 기록한 옷이 아직 없어요.</p>
              ) : (
                <div className="sn-pick-list">
                  {sameCategory.map((g) => {
                    const f = FITS[g.fit];
                    return (
                      <button
                        key={g.id}
                        className={`sn-pick-item ${sourceId === g.id ? "on" : ""}`}
                        onClick={() => setSourceId(g.id)}
                      >
                        <span className="sn-pick-name">
                          {g.brand || g.product || "이름 없음"}
                        </span>
                        {g.sizeLabel && <span className="sn-size">{g.sizeLabel}</span>}
                        {f && <span className={`sn-fit tone-${f.tone}`}>{f.label}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <label className="sn-l">사려는 옷의 실측 치수 (cm)</label>
              <div className="sn-measure-grid">
                {cat.fields.map((f) => (
                  <div key={f.key} className="sn-mfield">
                    <span>{f.label}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={input[f.key] || ""}
                      onChange={(e) => setM(f.key, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {!hasSource ? (
            <p className="sn-hint">
              {mode === "pick"
                ? "위에서 옷을 고르면 비교가 시작돼요."
                : "치수를 하나 이상 입력하면 비교가 시작돼요."}
            </p>
          ) : results.length === 0 ? (
            <p className="sn-hint">비교할 다른 옷이 없어요. (고른 옷 자신은 제외돼요)</p>
          ) : (
            <>
              {verdict && (
                <div className={`sn-verdict tone-${verdict.tone}`}>
                  <span className="sn-verdict-pick">
                    추천: {best.ref.brand || best.ref.product || "기록"}
                    {best.ref.sizeLabel ? ` (${best.ref.sizeLabel})` : ""}
                  </span>
                  <span className="sn-verdict-text">
                    {verdict.text} · 잘 맞았던 옷 중 가장 비슷해요
                  </span>
                </div>
              )}
              <div className="sn-results">
                {results.map(({ ref, diffs, score }) => {
                  const isBest = best && ref.id === best.ref.id;
                  const fit = FITS[ref.fit];
                  return (
                    <div key={ref.id} className={`sn-result ${isBest ? "best" : ""}`}>
                      <div className="sn-result-head">
                        <div>
                          {isBest && <span className="sn-badge">추천</span>}
                          <h3>{ref.brand || ref.product || "기록"}</h3>
                          {ref.sizeLabel && <span className="sn-size">{ref.sizeLabel}</span>}
                          {fit && <span className={`sn-fit tone-${fit.tone}`}>{fit.label}</span>}
                        </div>
                        <span className="sn-avg">평균 ±{score.toFixed(1)}cm</span>
                      </div>
                      <div className="sn-diffs">
                        {diffs.map((d) => (
                          <div key={d.field} className="sn-diff">
                            <span className="sn-diff-lbl">{d.field}</span>
                            <span className="sn-diff-nums">
                              {d.mine} / {d.ref}
                            </span>
                            <span
                              className={`sn-diff-val ${
                                Math.abs(d.diff) < 1 ? "ok" : d.diff > 0 ? "big" : "small"
                              }`}
                            >
                              {d.diff === 0
                                ? "동일"
                                : d.diff > 0
                                ? `+${d.diff}`
                                : `${d.diff}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="sn-diff-legend">숫자는 “고른 옷 / 비교 옷” 순서예요. 오른쪽은 차이(cm).</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── styles ───────────────────────────────────────────────
const CSS = `
.sn{
  --bg:#1a1614; --card:#252019; --line:#3a3128;
  --ink:#f0e9dd; --mut:#a89a87; --soft:#7d7164;
  --accent:#d9a566; --accent-deep:#b8823f;
  --good:#8fb87a; --warn:#d9a566; --bad:#cc7a6b;
  --r:14px;
  max-width:920px; margin:0 auto; padding:20px 16px 80px;
  font-family:'Iowan Old Style',Georgia,'Noto Serif KR',serif;
  color:var(--ink); background:var(--bg); min-height:100vh;
  -webkit-font-smoothing:antialiased;
}
*{box-sizing:border-box}
.sn h1,.sn h2,.sn h3{margin:0;font-weight:600;letter-spacing:-0.01em}
.sn-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:22px;flex-wrap:wrap}
.sn-brand{display:flex;gap:13px;align-items:center}
.sn-mark{font-size:30px;color:var(--accent);line-height:1}
.sn-brand h1{font-size:25px;letter-spacing:0.02em}
.sn-brand p{margin:2px 0 0;font-size:12.5px;color:var(--mut);font-family:'Helvetica Neue',sans-serif;letter-spacing:0.01em}
.sn-stat{display:flex;align-items:baseline;gap:7px;background:var(--card);border:1px solid var(--line);padding:9px 15px;border-radius:var(--r)}
.sn-stat-num{font-size:21px;font-weight:600;font-family:'Helvetica Neue',sans-serif}
.sn-stat-num.good{color:var(--good)}
.sn-stat-lbl{font-size:11px;color:var(--mut);font-family:'Helvetica Neue',sans-serif}
.sn-stat-div{width:1px;height:18px;background:var(--line);margin:0 4px;align-self:center}
.sn-head-right{display:flex;align-items:center;gap:10px}
.sn-signout{background:none;border:1px solid var(--line);color:var(--soft);font-size:12px;font-family:'Helvetica Neue',sans-serif;padding:8px 12px;border-radius:10px;cursor:pointer;transition:.15s}
.sn-signout:hover{color:var(--ink);border-color:var(--soft)}

.sn-login{max-width:380px;margin:0 auto;padding:72px 24px;text-align:center;display:flex;flex-direction:column;align-items:center}
.sn-login-mark{font-size:46px;color:var(--accent);line-height:1;margin-bottom:14px}
.sn-login h1{font-size:30px;letter-spacing:0.02em;margin-bottom:6px}
.sn-login-sub{font-size:14px;color:var(--mut);font-family:'Helvetica Neue',sans-serif;margin:0 0 28px}
.sn-login-desc{font-size:14px;color:var(--soft);line-height:1.7;margin:0 0 28px}
.sn-login-btn{display:inline-flex;align-items:center;gap:10px;background:var(--ink);color:#1a1410;border:none;font-family:'Helvetica Neue',sans-serif;font-size:15px;font-weight:600;padding:13px 26px;border-radius:12px;cursor:pointer;transition:.15s}
.sn-login-btn:hover{background:#fff}
.sn-g{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#fff;color:#4285f4;border-radius:50%;font-weight:700;font-size:14px}
.sn-login-err{color:var(--bad);font-size:13px;font-family:'Helvetica Neue',sans-serif;margin-top:16px}

.sn-nav{display:flex;gap:8px;margin-bottom:22px;align-items:center}
.sn-nav button{background:none;border:none;color:var(--soft);font-size:15px;font-family:inherit;padding:8px 4px;cursor:pointer;border-bottom:2px solid transparent;transition:.18s}
.sn-nav button:hover{color:var(--ink)}
.sn-nav button.on{color:var(--accent);border-color:var(--accent)}
.sn-nav .sn-add{margin-left:auto;background:var(--accent);color:#1a1410;border-radius:10px;padding:8px 16px;font-weight:600;border:none}
.sn-nav .sn-add:hover{background:var(--accent-deep);color:#fff}

.sn-filter{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:18px}
.sn-filter button{background:var(--card);border:1px solid var(--line);color:var(--mut);font-family:'Helvetica Neue',sans-serif;font-size:13px;padding:6px 14px;border-radius:20px;cursor:pointer;transition:.16s}
.sn-filter button:hover{color:var(--ink)}
.sn-filter button.on{background:var(--accent);border-color:var(--accent);color:#1a1410;font-weight:600}

.sn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:15px}
.sn-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column}
.sn-card-photo{height:150px;background-size:cover;background-position:center;background-color:#2e2820}
.sn-card-noimg{display:flex;align-items:center;justify-content:center;font-size:46px;color:var(--soft)}
.sn-card-body{padding:13px 14px 12px}
.sn-card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
.sn-card-cat{font-size:11px;color:var(--mut);font-family:'Helvetica Neue',sans-serif;letter-spacing:.03em}
.sn-card h3{font-size:17px}
.sn-card-sub{margin:3px 0 0;font-size:13px;color:var(--mut);display:flex;gap:8px;align-items:center;font-family:'Helvetica Neue',sans-serif}
.sn-size{background:#332b20;color:var(--accent);padding:1px 8px;border-radius:6px;font-size:11.5px;font-weight:600}
.sn-fit{font-size:11px;padding:2px 9px;border-radius:20px;font-family:'Helvetica Neue',sans-serif;font-weight:600}
.sn-fit.tone-good{background:rgba(143,184,122,.15);color:var(--good)}
.sn-fit.tone-warn{background:rgba(217,165,102,.15);color:var(--warn)}
.sn-fit.tone-bad{background:rgba(204,122,107,.15);color:var(--bad)}
.sn-measure{display:flex;flex-wrap:wrap;gap:5px 12px;margin:11px 0 0;font-size:12px;color:var(--soft);font-family:'Helvetica Neue',sans-serif}
.sn-measure b{color:var(--ink);font-weight:600}
.sn-note{margin:10px 0 0;font-size:13px;color:var(--mut);line-height:1.5;padding-top:9px;border-top:1px solid var(--line)}
.sn-card-actions{display:flex;gap:6px;margin-top:12px}
.sn-card-actions button{flex:0 0 auto;background:none;border:1px solid var(--line);color:var(--soft);font-size:12px;font-family:'Helvetica Neue',sans-serif;padding:5px 12px;border-radius:8px;cursor:pointer;transition:.15s}
.sn-card-actions button:hover{color:var(--ink);border-color:var(--soft)}
.sn-card-actions button.danger{background:var(--bad);border-color:var(--bad);color:#1a1410;font-weight:600}
.sn-shop{background:var(--accent);border:1px solid var(--accent);color:#1a1410;font-size:12px;font-weight:600;font-family:'Helvetica Neue',sans-serif;padding:5px 12px;border-radius:8px;cursor:pointer;text-decoration:none;transition:.15s}
.sn-shop:hover{background:var(--accent-deep);border-color:var(--accent-deep);color:#fff}

.sn-empty{text-align:center;padding:60px 20px;color:var(--mut);font-size:14px;line-height:1.7}
.sn-empty-big{font-size:18px;color:var(--ink);margin:0 0 6px}

.sn-form{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px 22px;max-width:600px;margin:0 auto}
.sn-form h2{font-size:21px;margin-bottom:20px}
.sn-l{display:block;font-size:12.5px;color:var(--mut);font-family:'Helvetica Neue',sans-serif;letter-spacing:.02em;margin:18px 0 7px}
.sn-l:first-of-type{margin-top:0}
.sn input,.sn textarea{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:10px;color:var(--ink);font-family:'Helvetica Neue',sans-serif;font-size:14.5px;padding:10px 12px;outline:none;transition:.15s}
.sn input:focus,.sn textarea:focus{border-color:var(--accent)}
.sn textarea{min-height:74px;resize:vertical;line-height:1.55}
.sn-row2{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.sn-cat-pick{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.sn-cat-pick button{background:var(--bg);border:1px solid var(--line);color:var(--mut);border-radius:11px;padding:12px 4px;cursor:pointer;font-family:'Helvetica Neue',sans-serif;font-size:13px;display:flex;flex-direction:column;align-items:center;gap:5px;transition:.15s}
.sn-cat-pick button span{font-size:21px}
.sn-cat-pick button:hover{color:var(--ink)}
.sn-cat-pick button.on{border-color:var(--accent);color:var(--accent);background:#2c2519}
.sn-measure-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.sn-mfield{display:flex;flex-direction:column;gap:5px}
.sn-mfield span{font-size:12px;color:var(--soft);font-family:'Helvetica Neue',sans-serif}
.sn-fit-pick{display:flex;gap:9px}
.sn-fit-pick button{flex:1;background:var(--bg);border:1px solid var(--line);color:var(--mut);border-radius:10px;padding:11px;cursor:pointer;font-family:inherit;font-size:14.5px;transition:.15s}
.sn-fit-pick button.on.tone-good{border-color:var(--good);color:var(--good);background:rgba(143,184,122,.1)}
.sn-fit-pick button.on.tone-warn{border-color:var(--warn);color:var(--warn);background:rgba(217,165,102,.1)}
.sn-fit-pick button.on.tone-bad{border-color:var(--bad);color:var(--bad);background:rgba(204,122,107,.1)}
.sn-photo-pick{display:flex}
.sn-photo-add{background:var(--bg);border:1px dashed var(--line);color:var(--mut);border-radius:11px;padding:22px 30px;cursor:pointer;font-family:'Helvetica Neue',sans-serif;font-size:14px;transition:.15s}
.sn-photo-add:hover{border-color:var(--accent);color:var(--ink)}
.sn-photo-prev{position:relative;width:130px;height:130px;border-radius:11px;background-size:cover;background-position:center;border:1px solid var(--line)}
.sn-photo-prev button{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;cursor:pointer;font-size:13px}
.sn-form-actions{display:flex;gap:10px;margin-top:26px}
.sn-form-actions button{flex:1;padding:13px;border-radius:11px;font-family:inherit;font-size:15px;cursor:pointer;border:none;transition:.15s}
.sn-secondary{background:var(--bg);border:1px solid var(--line)!important;color:var(--mut)}
.sn-secondary:hover{color:var(--ink)}
.sn-primary{background:var(--accent);color:#1a1410;font-weight:600}
.sn-primary:hover{background:var(--accent-deep);color:#fff}

.sn-compare-intro{font-size:14px;color:var(--mut);line-height:1.6;margin:0 0 18px}
.sn-mode{display:flex;gap:8px;margin:4px 0 18px;background:var(--card);border:1px solid var(--line);border-radius:11px;padding:4px}
.sn-mode button{flex:1;background:none;border:none;color:var(--mut);font-family:'Helvetica Neue',sans-serif;font-size:13.5px;padding:9px;border-radius:8px;cursor:pointer;transition:.15s}
.sn-mode button.on{background:var(--accent);color:#1a1410;font-weight:600}
.sn-pick-list{display:flex;flex-direction:column;gap:8px}
.sn-pick-item{display:flex;align-items:center;gap:9px;background:var(--card);border:1px solid var(--line);border-radius:11px;padding:12px 14px;cursor:pointer;text-align:left;transition:.15s}
.sn-pick-item:hover{border-color:var(--soft)}
.sn-pick-item.on{border-color:var(--accent);background:#2c2519}
.sn-pick-name{flex:1;font-size:14.5px;color:var(--ink);font-family:'Helvetica Neue',sans-serif}
.sn-verdict{display:flex;flex-direction:column;gap:3px;border-radius:var(--r);padding:14px 17px;margin:20px 0 4px;border:1px solid}
.sn-verdict.tone-good{background:rgba(143,184,122,.12);border-color:var(--good)}
.sn-verdict.tone-warn{background:rgba(217,165,102,.12);border-color:var(--warn)}
.sn-verdict.tone-bad{background:rgba(204,122,107,.12);border-color:var(--bad)}
.sn-verdict-pick{font-size:15.5px;font-weight:600;color:var(--ink)}
.sn-verdict-text{font-size:13px;color:var(--mut);font-family:'Helvetica Neue',sans-serif}
.sn-compare-intro b{color:var(--good)}
.sn-hint{font-size:13px;color:var(--soft);font-family:'Helvetica Neue',sans-serif;margin-top:16px;text-align:center}
.sn-results{display:flex;flex-direction:column;gap:13px;margin-top:20px}
.sn-result{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px 17px}
.sn-result.best{border-color:var(--good);box-shadow:0 0 0 1px rgba(143,184,122,.25)}
.sn-result-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:13px}
.sn-result-head h3{font-size:17px;display:inline}
.sn-badge{display:inline-block;background:var(--good);color:#1a1410;font-size:11px;font-weight:700;font-family:'Helvetica Neue',sans-serif;padding:2px 9px;border-radius:6px;margin-right:8px;vertical-align:middle}
.sn-result-head .sn-size{margin-left:8px}
.sn-avg{font-size:12.5px;color:var(--mut);font-family:'Helvetica Neue',sans-serif;white-space:nowrap}
.sn-diffs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.sn-diff{display:flex;align-items:baseline;gap:7px;background:var(--bg);border-radius:8px;padding:8px 11px;font-family:'Helvetica Neue',sans-serif}
.sn-diff-lbl{font-size:12.5px;color:var(--soft);flex:1;min-width:0}
.sn-diff-nums{font-size:12.5px;color:var(--ink);white-space:nowrap}
.sn-diff-val{font-size:12px;font-weight:600;white-space:nowrap}
.sn-diff-val.ok{color:var(--good)}
.sn-diff-val.big{color:var(--warn)}
.sn-diff-legend{font-size:11.5px;color:var(--soft);font-family:'Helvetica Neue',sans-serif;margin-top:12px;text-align:center}
.sn-diff-val.small{color:var(--bad)}

@media(max-width:520px){
  .sn-row2,.sn-cat-pick{grid-template-columns:1fr 1fr}
  .sn-stat{order:3}
}
`;
