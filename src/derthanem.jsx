/* eslint-disable */
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

/* ─── Supabase ─────────────────────────────────────────────── */
// npm install @supabase/supabase-js
const supabase = createClient(
  "https://jhkbyieucbghvdrpxyzn.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impoa2J5aWV1Y2JnaHZkcnB4eXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NzU0NjIsImV4cCI6MjA4OTM1MTQ2Mn0.uZ0xk685GnsaO2cJXAq8XWAXoMUT_x81UCo1JfIGU18"
);

/* ─── Supabase satır → uygulama objesi ────────────────────── */
const mapDert = (d) => ({
  id:         d.id,
  authorId:   d.author_id,
  author:     d.is_anon ? "Anonim" : (d.profiles?.name || "?"),
  avatar:     d.is_anon ? "?" : (d.profiles?.name?.[0]?.toUpperCase() || "?"),
  gender:     d.profiles?.gender || "female",
  isAnon:     d.is_anon,
  title:      d.title,
  content:    d.content,
  ts:         new Date(d.created_at).getTime(),
  category:   d.category,
  solved:     d.solved === true || d.solved === 1,
  closed:     d.closed === true || d.closed === 1,
  relatableBy:(d.relates  || []).map(r => r.user_id),
  isNew:      false,
  comments:   (d.comments || [])
    .slice().sort((a,b) => a.id - b.id)
    .map(c => ({
      id:         c.id,
      authorId:   c.author_id,
      author:     c.profiles?.name || "?",
      avatar:     c.profiles?.name?.[0]?.toUpperCase() || "?",
      text:       c.text,
      stars:      c.stars  || 0,
      ownerRated: c.owner_rated || false,
      badge:      c.badge  || null,
      likedBy:    (c.likes || []).map(l => l.user_id),
    })),
});

/* ─── Config ──────────────────────────────────────────────── */
const ADMIN_EMAIL = "memofti@gmail.com";
const CATS = ["Hepsi","İş","Aile","Aşk","Arkadaşlık","Sağlık","Para"];
const CAT_ICONS = { Hepsi:"✦", İş:"💼", Aile:"🏠", Aşk:"❤️", Arkadaşlık:"🤝", Sağlık:"🌿", Para:"💰" };

/* ─── İçerik Moderasyon Sistemi ───────────────────────────── */

// Katman 1 — Türkçe küfür & hakaret listesi (kök bazlı)
/* ─── İçerik Moderasyon Sistemi v3 ────────────────────────── */

// ── Katman 1: Küfür & hakaret kökleri ──
const BANNED_ROOTS = [
  "orospu","oç","sik","amk","am ","amın","amcık","göt","götveren","yarrak","yarak",
  "ibne","ibnelik","orosbuçocu","kahpe","kaltak","sürtük","orospuçocu","piç",
  "gerizekalı","gerzek","salak","aptal","mal ","malın","şerefsiz","alçak",
  "aşağılık","haysiyetsiz","namussuz","ahlaksız","edepsiz","terbiyesiz",
  "rezil","pislik","gavur","kancık","orospu","bok","sıç","göbeğini",
  "öldürürüm","öldüreceğim","seni gebertir","kafana sıkar","döverim",
  "yakacağım","parçalarım","kanını dökerim",
  "fuck","shit","bitch","bastard","asshole","cunt","nigger","faggot","dick","pussy",
];

// ── Katman 2: Leet speak & Unicode normalize tablosu ──
const LEET = {
  // Rakam hileleri
  "0":"o","1":"i","3":"e","4":"a","5":"s","6":"g","7":"t","8":"b","9":"g",
  // Sembol hileleri
  "@":"a","$":"s","!":"i","|":"l","(":"c",")":"o","+":"t",
  // Türkçe → Latin
  "ı":"i","ş":"s","ç":"c","ğ":"g","ü":"u","ö":"o",
  "İ":"i","Ş":"s","Ç":"c","Ğ":"g","Ü":"u","Ö":"o",
  // Kiril → Latin (görsel benzerler)
  "а":"a","е":"e","о":"o","р":"p","с":"c","х":"x","у":"y",
  "А":"a","Е":"e","О":"o","Р":"p","С":"c","Х":"x","У":"y",
  // Yunan → Latin
  "α":"a","ε":"e","ο":"o","ρ":"r","τ":"t","ν":"n",
};

// Normalize: tüm hileleri temizle
const normalize = (t) => {
  // 1. Görünmez & kontrol karakterleri temizle (zero-width space, RTL mark vb.)
  let s = t.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "");
  // 2. Leet speak & Unicode dönüşümü
  s = s.split("").map(c => LEET[c] || c).join("");
  // 3. Küçük harfe çevir
  s = s.toLowerCase();
  // 4. Tekrar eden harfleri tek harfe indir (siiiik → sik, fuuuck → fuck)
  s = s.replace(/(.)\1{2,}/g, "$1");
  // 5. Tüm ayraçları kaldır (boşluk, nokta, tire, _ vb.)
  s = s.replace(/[\s_.,"'*+|\\/<>()[\]{}]|-/g, "");
  return s;
};

// ── Katman 3: Fraud & spam regex kalıpları ──
const FRAUD_PATTERNS = [
  { re:/(\+90|0090|0)?\s*[([]?\d{3}[)\]]?\s*[-.\s]?\d{3}[-.\s]?\d{2}[-.\s]?\d{2}/, label:"telefon numarası" },
  { re:/[a-zA-Z0-9._%+]+@[a-zA-Z0-9.]+\.[a-zA-Z]{2,}/,                              label:"email adresi" },
  { re:/https?:\/\//i,                                                                 label:"link/URL" },
  { re:/www\.\S+/i,                                                                    label:"link/URL" },
  { re:/\S+\.(com|net|org|io|app|co|tr|link|xyz|site|click|shop|info)\b/i,            label:"link/URL" },
  { re:/\b(whatsapp|telegram|instagram|twitter|tiktok|discord|t\.me)\b/i,             label:"sosyal medya" },
  { re:/\b(iban|banka\s*hesab|papara|ininal|kripto|bitcoin|usdt|ödeme\s*yap|havale|eft|swift)\b/i, label:"ödeme/dolandırıcılık" },
  { re:/\b(bedava|ücretsiz kazan|para kazan|kazanç fırsatı|tıkla kazan|anında öde|borç ver|borç al|kredi)\b/i, label:"spam/pazarlama" },
  { re:/\b(şifre|parola|tc kimlik|kimlik no|kart no|cvv|pin kodu)\b/i,               label:"kişisel veri talebi" },
  { re:/(.)\1{5,}/,                                                                    label:"spam tekrar" },
];

// ── Katman 4: Davranış bazlı (kullanıcı yaşı) ──
// Bu runtime'da çağrılır, user objesi alır
const isNewAccount = (user) => {
  if (!user || !user.registeredAt) return false;
  return (Date.now() - user.registeredAt) < 5 * 60 * 1000; // 5 dakika
};

// ── Katman 5: İçerik parmak izi (tekrar mesaj tespiti) ──
const recentFingerprints = new Map(); // userId → [hash, hash, ...]
const fingerprint = (text) => text.trim().toLowerCase().replace(/\s+/g,"").slice(0,80);
const isDuplicate = (userId, text) => {
  const fp = fingerprint(text);
  const prev = recentFingerprints.get(userId) || [];
  if (prev.includes(fp)) return true;
  // Son 5 mesajı sakla
  recentFingerprints.set(userId, [...prev.slice(-4), fp]);
  return false;
};

// ── Katman 6: Aşırı büyük harf (bağırma spam) ──
const isAllCaps = (raw) => {
  const letters = raw.replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ]/g,"");
  if (letters.length < 8) return false;
  const upRatio = letters.split("").filter(c=>c===c.toUpperCase()&&c!==c.toLowerCase()).length / letters.length;
  return upRatio > 0.72;
};

// ── Ana kontrol: fraud/spam → engelle, küfür → sansürle ──
const checkContent = (raw, user=null) => {
  if (!raw || !raw.trim()) return { ok:true };

  // Fraud & spam kalıpları (engelle)
  for (const { re, label } of FRAUD_PATTERNS) {
    if (re.test(raw)) return { ok:false, reason:label };
  }

  // Yeni hesap linki (engelle)
  if (isNewAccount(user)) {
    const suspiciousNew = /\d{10,}|@|\bwww\b|\.com/.test(raw);
    if (suspiciousNew) return { ok:false, reason:"yeni hesap kısıtlaması" };
  }

  // Aşırı büyük harf (engelle)
  if (isAllCaps(raw)) return { ok:false, reason:"aşırı büyük harf" };

  // Küfür → geçmesine izin ver ama sansürle (ok:true, censored:true)
  const norm = normalize(raw);
  for (const root of BANNED_ROOTS) {
    if (norm.includes(normalize(root))) return { ok:true, hasCurse:true };
  }

  return { ok:true };
};

const hasBanned = (t) => !checkContent(t).ok;

const warnMsg = (raw, user=null) => {
  const r = checkContent(raw, user);
  if (r.ok) return "";
  const map = {
    "telefon numarası":        "⚠ Telefon numarası paylaşmak yasak — güvenliğin için.",
    "email adresi":            "⚠ E-posta adresi paylaşmak yasak.",
    "link/URL":                "⚠ Link paylaşmak yasak.",
    "sosyal medya":            "⚠ Sosyal medya adresi paylaşmak yasak.",
    "ödeme/dolandırıcılık":    "⚠ Ödeme bilgisi paylaşmak kesinlikle yasaktır.",
    "kişisel veri talebi":     "⚠ Şifre veya kimlik bilgisi paylaşmayın.",
    "spam/pazarlama":          "⚠ Reklam veya spam içeriği tespit edildi.",
    "spam tekrar":             "⚠ İçerik spam olarak algılandı.",
    "yeni hesap kısıtlaması":  "⚠ Yeni hesaplar ilk 5 dakika iletişim bilgisi paylaşamaz.",
    "aşırı büyük harf":        "⚠ Lütfen büyük harfle yazmaktan kaçın.",
  };
  return map[r.reason] || "⚠ Yasaklı içerik tespit edildi.";
};

// Sansür: küfürleri *** ile değiştir (gönderim anında)
const censorText = (raw) => {
  if (!raw) return raw;
  let result = raw;
  for (const root of BANNED_ROOTS) {
    const re = new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"), "gi");
    result = result.replace(re, m => m[0]+"*".repeat(Math.max(1,m.length-1)));
  }
  return result;
};

function computeBoard(derts) {
  const map = {};
  derts.forEach(d => d.comments.forEach(c => {
    if (!c.ownerRated) return;
    if (!map[c.authorId]) map[c.authorId] = { authorId:c.authorId, name:c.author, avatar:c.avatar, total:0, count:0, gold:0, silver:0 };
    map[c.authorId].total += c.stars;
    map[c.authorId].count += 1;
    if (c.badge === "gold") map[c.authorId].gold++;
    if (c.badge === "silver") map[c.authorId].silver++;
  }));
  return Object.values(map)
    .map(u => ({ ...u, avg: (u.total / u.count).toFixed(1) }))
    .sort((a,b) => parseFloat(b.avg) - parseFloat(a.avg));
}

function computeStats(derts) {
  const total      = derts.length;
  const solved     = derts.filter(d=>d.solved).length;
  const closed     = derts.filter(d=>d.closed&&!d.solved).length;
  const waiting    = derts.filter(d=>!d.solved&&!d.closed&&d.comments.length===0).length;
  const catCounts  = {};
  derts.forEach(d=>{ catCounts[d.category]=(catCounts[d.category]||0)+1; });
  const topCat     = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0];
  const totalComs  = derts.reduce((s,d)=>s+d.comments.length,0);
  const avgDerman  = total ? (totalComs/total).toFixed(1) : "0";
  const relateCounts = derts.map(d=>(d.relatableBy||[]).length);
  const maxRelate  = Math.max(0,...relateCounts);
  const mostRelated = derts.find(d=>(d.relatableBy||[]).length===maxRelate&&maxRelate>0);
  return { total, solved, closed, waiting, topCat, totalComs, avgDerman, mostRelated, maxRelate, catCounts };
}
/* ─── Tiny components ─────────────────────────────────────── */
function Av({ char, inv, size=36 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", flexShrink:0,
      background: inv ? "#fff" : "#111", border:`2px solid ${inv?"#111":"#fff"}`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:Math.floor(size*0.38), fontWeight:800, color: inv?"#111":"#fff",
      fontFamily:"'Georgia',serif", userSelect:"none" }}>{char}</div>
  );
}

function ScoreBar({ value, inv }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <span style={{ fontSize:20, fontWeight:900, lineHeight:1, color:inv?"#fff":"#111", minWidth:32 }}>
        {value}<span style={{ fontSize:10, fontWeight:400, opacity:.4 }}>/10</span>
      </span>
      <div style={{ flex:1, height:4, background: inv?"rgba(255,255,255,.15)":"#eee", borderRadius:2, overflow:"hidden", minWidth:40 }}>
        <div style={{ height:"100%", width:`${value*10}%`, background: inv?"#fff":"#111", borderRadius:2, transition:"width .5s" }}/>
      </div>
    </div>
  );
}

function Badge({ type }) {
  if (!type) return null;
  const cfg = type==="gold"
    ? { label:"Altın Derman", sym:"★", bg:"#fdf8e1", fg:"#9a7000", br:"#e6c000" }
    : { label:"Gümüş Derman", sym:"✦", bg:"#f4f4f4", fg:"#666", br:"#bbb" };
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3,
      fontSize:9, fontWeight:700, letterSpacing:1, textTransform:"uppercase",
      background:cfg.bg, color:cfg.fg, border:`1.5px solid ${cfg.br}`,
      padding:"2px 7px", borderRadius:2, whiteSpace:"nowrap", flexShrink:0 }}>
      {cfg.sym} {cfg.label}
    </span>
  );
}

function StarPicker({ onChange, dertSolved }) {
  const [hov, setHov] = useState(0);
  const [sel, setSel] = useState(0);

  const handleClick = (n) => {
    if (n === 10) {
      const ok = window.confirm(
        "10 puan veriyorsunuz.\n\nBu dert \"Dermana Ulaşmış\" sayılacak ve artık yeni derman yazılamayacak.\n\nOnaylıyor musunuz?"
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(n + " puan vermek istediğinize emin misiniz?");
      if (!ok) return;
    }
    setSel(n);
    onChange(n);
  };

  return (
    <div>
      <div style={{ display:"flex", gap:2, marginBottom:4 }}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <button key={n}
            onMouseEnter={() => setHov(n)} onMouseLeave={() => setHov(0)}
            onClick={() => handleClick(n)}
            style={{ background:"none", border:"none", cursor:"pointer", padding:"2px 3px",
              fontSize:16, lineHeight:1,
              opacity: hov >= n ? 1 : sel >= n ? .9 : .45,
              transform: hov === n ? "scale(1.35)" : "scale(1)",
              transition:"all .1s" }}>⭐</button>
        ))}
      </div>
      {hov > 0 && (
        <div style={{ fontSize:11, color:"#333", fontWeight:700 }}>
          {hov === 10
            ? "⚠ 10 puan — Dert Dermana Ulaşır, yeni derman yazılamaz"
            : hov + " puan ver"}
        </div>
      )}
    </div>
  );
}

/* ─── Auth Modal ──────────────────────────────────────────── */
function AuthModal({ mode, onClose, onAuth }) {
  const [tab, setTab] = useState(mode);
  const [f, setF] = useState({ name:"", email:"", password:"", gender:"female" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const iS = { width:"100%", padding:"11px 13px", marginBottom:12, boxSizing:"border-box",
    border:"2px solid #ddd", fontFamily:"'Georgia',serif", fontSize:14,
    background:"#fff", color:"#111", outline:"none" };
  const lS = { fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase",
    marginBottom:5, color:"#666", display:"block" };

  const handleSubmit = async () => {
    setErr(""); setLoading(true);
    if (!f.email.trim() || !f.password.trim()) { setErr("E-posta ve şifre zorunlu."); setLoading(false); return; }

    if (tab === "register") {
      if (!f.name.trim()) { setErr("Ad Soyad zorunlu."); setLoading(false); return; }
      const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password });
      if (error) { setErr(error.message); setLoading(false); return; }
      const { error: pe } = await supabase.from("profiles").insert({ id: data.user.id, name: f.name.trim(), gender: f.gender });
      if (pe) { setErr(pe.message); setLoading(false); return; }
      onAuth({ id: data.user.id, name: f.name.trim(), gender: f.gender, email: f.email.trim(), registeredAt: Date.now() });
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
      if (error) { setErr("E-posta veya şifre hatalı."); setLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
      onAuth({ id: data.user.id, name: profile?.name || f.email.split("@")[0],
        gender: profile?.gender || "female", email: f.email.trim(),
        registeredAt: new Date(profile?.created_at || Date.now()).getTime() });
    }
    setLoading(false);
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:3000,
      background:"rgba(0,0,0,.6)", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", width:"100%", maxWidth:400,
        border:"2px solid #111", boxShadow:"8px 8px 0 #111", fontFamily:"'Georgia',serif" }}>
        <div style={{ display:"flex", borderBottom:"2px solid #111" }}>
          {[["login","Giriş Yap"],["register","Üye Ol"]].map(([t,l]) => (
            <button key={t} onClick={() => { setTab(t); setErr(""); }} style={{ flex:1, padding:"14px", border:"none",
              background:tab===t?"#111":"#f2f2f2", color:tab===t?"#fff":"#888",
              cursor:"pointer", fontFamily:"'Georgia',serif", fontSize:12, fontWeight:700,
              letterSpacing:1.5, textTransform:"uppercase",
              borderRight:t==="login"?"2px solid #111":"none" }}>{l}</button>
          ))}
        </div>
        <div style={{ padding:"24px 24px 20px" }}>
          {tab==="register" && <>
            <label style={lS}>Ad Soyad</label>
            <input value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}
              placeholder="Adın Soyadın" style={iS}/>
            <label style={lS}>Cinsiyet</label>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              {["female","male"].map(g => (
                <button key={g} onClick={() => setF(p=>({...p,gender:g}))} style={{ flex:1, padding:"9px",
                  border:"2px solid #111", background:f.gender===g?"#111":"#fff",
                  color:f.gender===g?"#fff":"#111",
                  cursor:"pointer", fontFamily:"'Georgia',serif", fontSize:13, fontWeight:700 }}>
                  {g==="female"?"Kadın":"Erkek"}
                </button>
              ))}
            </div>
          </>}
          <label style={lS}>E-posta</label>
          <input value={f.email} onChange={e=>setF(p=>({...p,email:e.target.value}))}
            placeholder="ornek@mail.com" type="email" style={iS}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}/>
          <label style={lS}>Şifre</label>
          <input value={f.password} onChange={e=>setF(p=>({...p,password:e.target.value}))}
            placeholder="••••••••" type="password" style={iS}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}/>

          {err && (
            <div style={{ background:"#fff3f3", border:"2px solid #c0392b", padding:"10px 12px",
              marginBottom:12, fontSize:12, color:"#c0392b", fontWeight:700 }}>
              ⚠ {err}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading}
            style={{ width:"100%", padding:"13px", background: loading?"#555":"#111", color:"#fff",
            border:"2px solid #111", fontFamily:"'Georgia',serif", fontSize:14, fontWeight:700,
            cursor: loading?"not-allowed":"pointer", letterSpacing:1, marginBottom:8, boxShadow:"4px 4px 0 #555" }}>
            {loading ? "Bekleniyor..." : tab==="login" ? "Giriş Yap →" : "Hesap Oluştur →"}
          </button>
          <button onClick={onClose} style={{ width:"100%", padding:"10px", background:"#fff",
            color:"#666", border:"2px solid #eee", fontFamily:"'Georgia',serif",
            fontSize:13, cursor:"pointer" }}>Vazgeç</button>

          <div style={{ textAlign:"center", marginTop:12, fontSize:11, color:"#777" }}>
            {tab==="login" ? (
              <>Hesabın yok mu?{" "}
                <span onClick={()=>{setTab("register");setErr("");}}
                  style={{ color:"#111", fontWeight:700, cursor:"pointer", textDecoration:"underline" }}>
                  Üye ol
                </span>
              </>
            ) : (
              <>Zaten üye misin?{" "}
                <span onClick={()=>{setTab("login");setErr("");}}
                  style={{ color:"#111", fontWeight:700, cursor:"pointer", textDecoration:"underline" }}>
                  Giriş yap
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Landing ─────────────────────────────────────────────── */
// Tamamen saf CSS :hover — React state yok, mobilde asla takılmaz
function Landing({ onDert, onDerman }) {
  return (
    <>
      <style>{`
        @keyframes fu { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .lw {
          position:fixed; inset:0;
          display:flex; flex-direction:column;
          font-family:'Georgia',serif; overflow:hidden;
        }
        .lh {
          flex:1; display:flex; flex-direction:column;
          align-items:center; justify-content:center;
          cursor:pointer; position:relative; overflow:hidden;
          transition:flex .5s cubic-bezier(.77,0,.18,1);
        }
        .lh-t { border-bottom:2px solid #111; background:#fff; color:#111; }
        .lh-b { background:#111; color:#fff; }
        .li { text-align:center; padding:0 32px; user-select:none; animation:fu .8s ease both; }
        .lline { height:2px; display:inline-block; transition:width .4s; }
        .lline-dark  { background:#111; width:20px; }
        .lline-light { background:#fff; width:20px; }
        .lbtn {
          font-family:'Georgia',serif; font-size:12px; font-weight:700;
          letter-spacing:2.5px; text-transform:uppercase;
          padding:13px 36px; border:2px solid; cursor:pointer;
          transition:box-shadow .18s, transform .18s;
        }
        .lbtn-dark  { background:#111; color:#fff; border-color:#111; }
        .lbtn-light { background:#fff; color:#111; border-color:#fff; }
        /* Hover efekti SADECE gerçek mouse'lu cihazlarda */
        @media(hover:hover) {
          .lw:has(.lh-t:hover) .lh-t { flex:1.6 !important; }
          .lw:has(.lh-t:hover) .lh-b { flex:0.4 !important; }
          .lw:has(.lh-b:hover) .lh-b { flex:1.6 !important; }
          .lw:has(.lh-b:hover) .lh-t { flex:0.4 !important; }
          .lh-t:hover .lline-dark  { width:52px !important; }
          .lh-b:hover .lline-light { width:52px !important; }
          .lbtn:hover { transform:translate(-2px,-2px); box-shadow:5px 5px 0 rgba(0,0,0,.22); }
        }
      `}</style>
      <div className="lw">
        {/* TOP – beyaz */}
        <div className="lh lh-t" onClick={onDert}>
          <div className="li">
            <div style={{fontSize:10,letterSpacing:5,textTransform:"uppercase",marginBottom:22,opacity:.2}}>
              içini dök
            </div>
            <div style={{fontSize:"clamp(46px,10vw,90px)",fontWeight:900,lineHeight:.92,letterSpacing:"-3px"}}>
              Dert<br/>Anlat
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,margin:"22px 0"}}>
              <span className="lline lline-dark"/>
              <span style={{fontSize:12,opacity:.3,whiteSpace:"nowrap"}}>yüreğindeki yükü paylaş</span>
              <span className="lline lline-dark"/>
            </div>
            <button className="lbtn lbtn-dark">Üye Ol / Giriş Yap</button>
          </div>
          <div style={{position:"absolute",bottom:16,fontSize:9,letterSpacing:4,
            textTransform:"uppercase",opacity:.1}}>derthanem</div>
        </div>

        {/* BOTTOM – siyah */}
        <div className="lh lh-b" onClick={onDerman}>
          <div className="li" style={{animationDelay:".07s"}}>
            <div style={{fontSize:10,letterSpacing:5,textTransform:"uppercase",marginBottom:22,opacity:.2}}>
              bir umut ol
            </div>
            <div style={{fontSize:"clamp(46px,10vw,90px)",fontWeight:900,lineHeight:.92,letterSpacing:"-3px"}}>
              Derman<br/>Ol
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,margin:"22px 0"}}>
              <span className="lline lline-light"/>
              <span style={{fontSize:12,opacity:.3,whiteSpace:"nowrap"}}>çözüm üret, puan kazan</span>
              <span className="lline lline-light"/>
            </div>
            <button className="lbtn lbtn-light">Dertleri Gözat</button>
          </div>
          <div style={{position:"absolute",bottom:16,fontSize:9,letterSpacing:4,
            textTransform:"uppercase",opacity:.1}}>derthanem</div>
        </div>
      </div>
    </>
  );
}

function DertCard({ dert, i=0, user, openId, setOpenId,
                    cTexts, setCTexts, cWarns, setCWarns,
                    onRate, onComment, onEdit, onEditDert, onRelate, onClose, onDelete,
                    onDeleteComment, onLike, onReport, onNeedAuth, isNew=false, dark=false, userAvatar=null }) {
  const owned    = user && user.id === dert.authorId;
  const isOpen   = openId === dert.id;
  const cardBg   = dark ? "#1e1e1e" : "#fff";
  const cardBdr  = dark ? "#333"    : "#111";
  const subBg    = dark ? "#2a2a2a" : "#f9f9f9";
  const subBdr   = dark ? "#333"    : "#eee";
  const fgCard   = dark ? "#fff"    : "#111";
  const mutedCard= dark ? "#888"    : "#777";
  const [editingId,   setEditingId]   = useState(null);
  const [editText,    setEditText]    = useState("");
  const [copied,      setCopied]      = useState(false);
  const [reported,    setReported]    = useState(false);
  const [editingDert, setEditingDert] = useState(false);
  const [dertEditForm,setDertEditForm]= useState({ title:dert.title, content:dert.content });
  const taRef = useRef(null);

  const startEdit = (c) => { setEditingId(c.id); setEditText(c.text); };
  const saveEdit  = () => { if (editText.trim()) onEdit(dert.id, editingId, censorText(editText.trim())); setEditingId(null); };

  const hasRelated  = user && (dert.relatableBy||[]).includes(user.id);
  const relateCount = (dert.relatableBy||[]).length;

  const handleShare = () => {
    const text = `"${dert.title}" — derthanem.app/dert/${dert.id}`;
    navigator.clipboard?.writeText(text).catch(()=>{});
    setCopied(true);
    setTimeout(()=>setCopied(false), 2200);
  };

  const handleReport = (commentId) => {
    if (!user) { onNeedAuth("login"); return; }
    onReport(dert.id, commentId);
    setReported(true);
    setTimeout(()=>setReported(false), 3000);
  };

  const isClosed = dert.closed && !dert.solved;

  return (
    <div id={"dert-"+dert.id} className={`dert-card${isNew?" dert-new":""}`} style={{
      background: dert.solved ? "#fffbeb" : cardBg,
      border: dert.solved ? "2px solid #f39c12" : `2px solid ${cardBdr}`,
      marginBottom:16,
      boxShadow: dert.solved ? "6px 6px 0 #f39c12" : isClosed ? "3px 3px 0 #bbb" : "none",
      opacity: isClosed ? .72 : 1,
      transition:"box-shadow .3s, transform .18s",
      position:"relative", overflow:"hidden" }}>

      {/* Dermana Ulaştı — üst şerit */}
      {dert.solved && (
        <div style={{ background:"#f39c12", color:"#fff", padding:"10px 20px",
          display:"flex", alignItems:"center", justifyContent:"center", gap:10,
          borderBottom:"2px solid #e67e22" }}>
          <span style={{ fontSize:18 }}>⭐</span>
          <div style={{ fontSize:11, fontWeight:900, letterSpacing:3,
            textTransform:"uppercase" }}>Bu Dert Dermana Ulaştı!</div>
          <span style={{ fontSize:18 }}>⭐</span>
        </div>
      )}

      {/* Soğuk damga — sadece başlık alanında, sabit konumda */}
      {dert.solved && (
        <div style={{
          position:"absolute", top:42, right:16, zIndex:10,
          pointerEvents:"none", userSelect:"none",
        }}>
          <div style={{
            border:"3px solid rgba(243,156,18,0.5)",
            borderRadius:4, padding:"8px 18px",
            textAlign:"center",
            transform:"rotate(-6deg)",
          }}>
            <div style={{ fontSize:9, fontWeight:900, letterSpacing:4,
              textTransform:"uppercase", color:"rgba(243,156,18,0.7)",
              borderBottom:"2px solid rgba(243,156,18,0.5)",
              paddingBottom:4, marginBottom:4, lineHeight:1
            }}>Dermana</div>
            <div style={{ fontSize:18, fontWeight:900, letterSpacing:4,
              textTransform:"uppercase", color:"rgba(243,156,18,0.7)",
              lineHeight:1
            }}>Ulaştı</div>
          </div>
        </div>
      )}

      {/* Sol kategori şeridi */}
      <div style={{
        position:"absolute", left:0, top:0, bottom:0, width:3,
        background: dert.solved ? "#111" : isClosed ? "#bbb" :
          ({ İş:"#2980b9", Aile:"#8e44ad", Aşk:"#e74c3c",
             Arkadaşlık:"#27ae60", Sağlık:"#16a085", Para:"#d35400" }[dert.category] || "#111"),
        opacity: dert.solved ? 1 : 0.6
      }}/>

      {/* Kapatıldı bandı */}
      {isClosed && (
        <div style={{ background:subBg, color:mutedCard, padding:"7px 18px 7px 22px",
          display:"flex", alignItems:"center", gap:10, borderBottom:`1.5px solid ${subBdr}` }}>
          <span style={{ fontSize:13 }}>🔒</span>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:2, textTransform:"uppercase" }}>
            Dert Kapatıldı · Sahibi "Derdim Geçti" dedi
          </div>
        </div>
      )}

      <div style={{ padding:"18px 20px 14px", paddingLeft:22 }}>
        {/* Author */}
        <div style={{ display:"flex", gap:12, minWidth:0 }}>
          <Av char={(user && dert.authorId===user.id && userAvatar) ? userAvatar : dert.avatar} inv size={38}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", minWidth:0 }}>
              <span style={{ fontWeight:700, fontSize:14, color:fgCard }}>{dert.author}</span>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase",
                background:fgCard, color:cardBg, padding:"2px 7px", flexShrink:0 }}>{dert.category}</span>
              {dert.isAnon && <span style={{ fontSize:9, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase",
                border:`1.5px solid ${subBdr}`, color:mutedCard, padding:"2px 7px", flexShrink:0 }}>anonim</span>}
              {owned && <span style={{ fontSize:9, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase",
                border:`1.5px solid ${subBdr}`, color:mutedCard, padding:"2px 7px", flexShrink:0 }}>senin derdin</span>}
              <span style={{ fontSize:11, color:"#888", marginLeft:"auto", flexShrink:0 }}>{
                dert.ts ? (()=>{
                  const d=Math.floor((Date.now()-dert.ts)/1000);
                  if(d<60) return "Az önce";
                  if(d<3600) return `${Math.floor(d/60)} dk önce`;
                  if(d<86400) return `${Math.floor(d/3600)} sa önce`;
                  return `${Math.floor(d/86400)} gün önce`;
                })() : dert.time
              }</span>
            </div>
            <div style={{ fontSize:15, fontWeight:800, marginTop:8, lineHeight:1.35,
              letterSpacing:"-.3px", wordBreak:"break-word", color:fgCard }}>
              {editingDert ? (
                <input value={dertEditForm.title}
                  onChange={e=>setDertEditForm(p=>({...p,title:e.target.value}))}
                  style={{ width:"100%", padding:"8px 10px", fontFamily:"'Georgia',serif",
                    fontSize:15, fontWeight:800, border:`2px solid ${cardBdr}`,
                    background:cardBg, color:fgCard,
                    boxSizing:"border-box", outline:"none" }}/>
              ) : dert.title}
            </div>
            <div style={{ fontSize:13, color:dark?"#ccc":"#333", marginTop:6, lineHeight:1.8, wordBreak:"break-word" }}>
              {editingDert ? (
                <textarea value={dertEditForm.content}
                  onChange={e=>setDertEditForm(p=>({...p,content:e.target.value}))}
                  rows={3}
                  style={{ width:"100%", padding:"8px 10px", fontFamily:"'Georgia',serif",
                    fontSize:13, border:`2px solid ${cardBdr}`, lineHeight:1.8,
                    background:cardBg, color:fgCard,
                    resize:"vertical", boxSizing:"border-box", outline:"none", marginTop:6 }}/>
              ) : dert.content}
            </div>
            {editingDert && (
              <div style={{ display:"flex", gap:6, marginTop:8 }}>
                <button onClick={()=>{
                  if(dertEditForm.title.trim()&&dertEditForm.content.trim())
                    onEditDert(dert.id, dertEditForm);
                  setEditingDert(false);
                }} style={{ padding:"6px 14px", background:"#111", color:"#fff",
                  border:"2px solid #111", cursor:"pointer",
                  fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700 }}>Kaydet</button>
                <button onClick={()=>setEditingDert(false)}
                  style={{ padding:"6px 14px", background:"#fff", color:"#888",
                    border:"2px solid #ddd", cursor:"pointer",
                    fontFamily:"'Georgia',serif", fontSize:11 }}>Vazgeç</button>
              </div>
            )}
          </div>
        </div>

        {/* Aksiyon çubuğu: benziyor + paylaş + kapat */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:14,
          paddingTop:12, borderTop:"1.5px solid #f0f0f0", flexWrap:"wrap" }}>

          {/* Benimkine benziyor */}
          {!owned && (
            <button
              onClick={()=> user ? onRelate(dert.id) : onNeedAuth("login")}
              style={{
                display:"flex", alignItems:"center", gap:5,
                padding:"5px 11px", border:"1.5px solid",
                borderColor: hasRelated ? "#111" : "#ddd",
                background: hasRelated ? "#111" : "#fff",
                color: hasRelated ? "#fff" : "#888",
                cursor:"pointer", fontFamily:"'Georgia',serif",
                fontSize:11, fontWeight:700, transition:"all .15s"
              }}>
              🤝 {relateCount > 0 ? `${relateCount} kişi` : "Benimkine benziyor"}
            </button>
          )}
          {owned && relateCount > 0 && (
            <span style={{ fontSize:11, color:"#666", fontStyle:"italic" }}>
              🤝 {relateCount} kişi bu derde ortak
            </span>
          )}

          {/* Dert sahibine: düzenle */}
          {owned && !dert.solved && !isClosed && !editingDert && (
            <button onClick={()=>{ setDertEditForm({title:dert.title,content:dert.content}); setEditingDert(true); }}
              style={{ padding:"5px 11px", border:"1.5px solid #ddd", background:"#fff",
                color:"#666", cursor:"pointer", fontFamily:"'Georgia',serif",
                fontSize:11, fontWeight:700 }}>✏️ Düzenle</button>
          )}

          {/* Dert sil */}
          {owned && (
            <button onClick={()=>{
              const n = dert.comments.length;
              const msg = n > 0
                ? ("Bu derte " + n + " derman yazilmis. Yine de silmek istiyor musun?")
                : "Bu derdi silmek istiyor musun?";
              if (window.confirm(msg)) onDelete(dert.id);
            }} style={{
              padding:"5px 11px", border:"1.5px solid #ddd", background:"#fff",
              color:"#c0392b", cursor:"pointer", fontFamily:"'Georgia',serif",
              fontSize:11, fontWeight:700, opacity:.7, transition:"opacity .15s"
            }}
            onMouseEnter={e=>e.currentTarget.style.opacity=1}
            onMouseLeave={e=>e.currentTarget.style.opacity=.7}>
              Sil
            </button>
          )}

          {/* Dert kapatma — sadece sahibi, çözülmemişse */}
          {owned && !dert.solved && !isClosed && (
            <button onClick={()=>onClose(dert.id)} style={{
              padding:"5px 11px", border:"1.5px solid #ddd", background:"#fff",
              color:"#666", cursor:"pointer", fontFamily:"'Georgia',serif",
              fontSize:11, fontWeight:700, marginLeft:"auto"
            }}>🔒 Derdim Geçti</button>
          )}

          {/* Şikayet — dert sahibi olmayan */}
          {!owned && user && !dert.solved && !isClosed && (
            <button onClick={()=>handleReport(null)}
              style={{ padding:"5px 11px", border:"1.5px solid #ddd", background:"#fff",
                color: reported?"#c0392b":"#ddd", cursor:"pointer",
                fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700,
                transition:"color .2s" }}>
              {reported ? "✓ Bildirildi" : "🚩"}
            </button>
          )}

          {/* Paylaş */}
          <button onClick={handleShare} style={{
            display:"flex", alignItems:"center", gap:4,
            padding:"5px 11px", border:"1.5px solid #ddd", background:"#fff",
            color: copied ? "#27ae60" : "#aaa", cursor:"pointer",
            fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700,
            marginLeft: owned ? 0 : "auto",
            transition:"color .2s"
          }}>
            {copied ? "✓ Kopyalandı" : "🔗 Paylaş"}
          </button>
        </div>

        {/* Derman toggle */}
        <div onClick={()=>setOpenId(isOpen?null:dert.id)}
          style={{ display:"flex", alignItems:"center", gap:8, marginTop:10,
            paddingTop:10, borderTop:"1.5px solid #f0f0f0", cursor:"pointer", userSelect:"none" }}>
          <span style={{ fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color:"#777" }}>
            {dert.comments.length} Derman
          </span>
          {dert.comments.length>0 && (
            <span style={{ fontSize:10, color:"#ddd" }}>{isOpen?"▲ gizle":"▼ göster"}</span>
          )}
          {owned && !dert.solved && !isClosed && dert.comments.length>0 && (
            <span style={{ marginLeft:"auto", fontSize:10, color:"#c0392b", fontWeight:700,
              letterSpacing:.5, animation:"pulse 2s infinite" }}>★ Puanla → Dermanı seç</span>
          )}
        </div>

        {/* Comments */}
        {isOpen && dert.comments.length>0 && (
          <div style={{ marginTop:10 }}>
            {[...dert.comments]
              .sort((a,b) => (b.likedBy||[]).length - (a.likedBy||[]).length)
              .map(c => {
              const isBest      = c.ownerRated && c.stars===10;
              const isMyComment = user && user.id === c.authorId;
              const canEdit     = isMyComment && !c.ownerRated && !isClosed;
              const isEditing   = editingId === c.id;
              return (
                <div key={c.id} style={{
                  background: isBest?"#111":subBg,
                  color: isBest?"#fff":fgCard,
                  border: isBest?`2px solid ${cardBdr}`:`1.5px solid ${subBdr}`,
                  padding:"13px 15px", marginBottom:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:8 }}>
                    <Av char={(user && c.authorId===user.id && userAvatar) ? userAvatar : c.avatar} inv={!isBest} size={26}/>
                    <span style={{ fontSize:13, fontWeight:700 }}>{c.author}</span>
                    {c.badge && <Badge type={c.badge}/>}
                    {canEdit && !isEditing && (
                      <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                        <button onClick={()=>startEdit(c)} style={{
                          background:"none",
                          border:`1.5px solid ${isBest?"rgba(255,255,255,.3)":"#ddd"}`,
                          cursor:"pointer", padding:"2px 9px", fontSize:10, fontWeight:700,
                          letterSpacing:1, textTransform:"uppercase",
                          color: isBest?"rgba(255,255,255,.5)":"#aaa",
                          fontFamily:"'Georgia',serif" }}>Düzenle</button>
                        <button onClick={()=>{
                          if (window.confirm("Bu dermanı silmek istiyor musun?"))
                            onDeleteComment(dert.id, c.id);
                        }} style={{
                          background:"none",
                          border:"1.5px solid #ffaaaa",
                          cursor:"pointer", padding:"2px 9px", fontSize:10, fontWeight:700,
                          color:"#c0392b", fontFamily:"'Georgia',serif" }}>Sil</button>
                      </div>
                    )}
                  </div>
                  {isEditing ? (
                    <div style={{ paddingLeft:34 }}>
                      <textarea value={editText} onChange={e=>setEditText(e.target.value)} rows={3}
                        style={{ width:"100%", padding:"9px 11px", boxSizing:"border-box",
                          border:"2px solid #111", fontFamily:"'Georgia',serif",
                          fontSize:13, lineHeight:1.7, resize:"vertical",
                          background:"#fff", color:"#111", outline:"none", marginBottom:8 }}
                        autoFocus/>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={saveEdit} style={{ padding:"6px 14px", background:"#111",
                          color:"#fff", border:"2px solid #111", cursor:"pointer",
                          fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700 }}>Kaydet</button>
                        <button onClick={()=>setEditingId(null)} style={{ padding:"6px 14px",
                          background:"#fff", color:"#888", border:"2px solid #ddd",
                          cursor:"pointer", fontFamily:"'Georgia',serif", fontSize:11 }}>Vazgeç</button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin:"0 0 10px 34px", fontSize:13, lineHeight:1.78, wordBreak:"break-word" }}>{c.text}</p>
                  )}
                  {!isEditing && (
                    <div style={{ paddingLeft:34 }}>
                      {/* Like + Şikayet row */}
                      {!owned && user && (
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                          <button onClick={()=>onLike(dert.id, c.id)}
                            style={{ display:"flex", alignItems:"center", gap:4,
                              padding:"3px 9px", border:"1.5px solid",
                              borderColor:(c.likedBy||[]).includes(user.id)?"#111":"#eee",
                              background:(c.likedBy||[]).includes(user.id)?"#111":"transparent",
                              color:(c.likedBy||[]).includes(user.id)?"#fff":"#aaa",
                              cursor:"pointer", fontFamily:"'Georgia',serif",
                              fontSize:10, fontWeight:700, transition:"all .15s" }}>
                            👍 {(c.likedBy||[]).length>0 && (c.likedBy||[]).length}
                          </button>
                          <button onClick={()=>onReport(dert.id, c.id)}
                            style={{ padding:"3px 8px", border:"1.5px solid #eee",
                              background:"transparent", color:"#ddd",
                              cursor:"pointer", fontFamily:"'Georgia',serif",
                              fontSize:10, transition:"color .2s" }}>
                            🚩
                          </button>
                        </div>
                      )}
                      {owned && !dert.solved && !c.ownerRated && !isClosed ? (
                        <div>
                          <div style={{ fontSize:9, fontWeight:700, letterSpacing:2,
                            textTransform:"uppercase", color:"#333", marginBottom:6 }}>Puanla (1–10)</div>
                          <StarPicker onChange={stars=>onRate(dert.id,c.id,stars)}/>
                          <div style={{ fontSize:10, color:"#888", marginTop:5 }}>10 puan → dert dermana ulaşır ✦</div>
                        </div>
                      ) : c.ownerRated ? (
                        <ScoreBar value={c.stars} inv={isBest}/>
                      ) : (
                        <span style={{ fontSize:11, color:isBest?"rgba(255,255,255,.6)":"#888",
                          fontStyle:"italic" }}>Sadece dert sahibi puanlayabilir</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Yorum kutusu */}
        <div style={{ marginTop:12, paddingTop:12, borderTop:`1.5px solid ${subBdr}` }}>
          {!owned && !isClosed && !dert.solved ? (
            <>
              <div style={{ display:"flex", gap:8, alignItems:"flex-start", minWidth:0 }}>
                {user && <div style={{ flexShrink:0, marginTop:2 }}><Av char={user.name[0].toUpperCase()} inv size={30}/></div>}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ position:"relative" }}>
                  <textarea
                    ref={taRef}
                    value={cTexts[dert.id]||""}
                    onChange={e=>{
                      const v=e.target.value.slice(0,500);
                      setCTexts(p=>({...p,[dert.id]:v}));
                      setCWarns(p=>({...p,[dert.id]:warnMsg(v)}));
                    }}
                    onFocus={()=>setTimeout(()=>taRef.current?.scrollIntoView({behavior:"smooth",block:"center"}),300)}
                    onClick={()=>!user&&onNeedAuth("login")}
                    readOnly={!user}
                    placeholder={user?"Derman ol, çözüm öner…":"Derman olmak için giriş yap…"}
                    rows={3}
                    style={{ width:"100%", padding:"10px 12px", boxSizing:"border-box",
                      border:`2px solid ${subBdr}`, fontFamily:"'Georgia',serif", fontSize:13,
                      lineHeight:1.7, resize:"vertical", background:cardBg, color:fgCard,
                      cursor:user?"text":"pointer", outline:"none" }}/>
                  {user && (
                    <div style={{
                      position:"absolute", bottom:8, right:10,
                      fontSize:10, color: (cTexts[dert.id]||"").length > 450 ? "#c0392b" : "#ccc",
                      fontFamily:"'Georgia',serif", pointerEvents:"none"
                    }}>
                      {(cTexts[dert.id]||"").length}/500
                    </div>
                  )}
                  </div>
                  {cWarns[dert.id] && (
                    <div style={{ fontSize:11, color:"#c0392b", marginTop:4, fontWeight:700 }}>{cWarns[dert.id]}</div>
                  )}
                  <div style={{ display:"flex", justifyContent:"flex-end", marginTop:6 }}>
                    <button onClick={()=>user?onComment(dert.id):onNeedAuth("login")}
                      style={{ padding:"8px 20px", background:"#111", color:"#fff",
                        border:"2px solid #111", cursor:"pointer",
                        fontFamily:"'Georgia',serif", fontSize:13, fontWeight:700 }}>
                      Derman Yaz →
                    </button>
                  </div>
                </div>
              </div>
              {!user && (
                <div style={{ fontSize:11, color:"#888", marginTop:6, textAlign:"center" }}>
                  <span onClick={()=>onNeedAuth("login")} style={{ color:"#111",fontWeight:700,cursor:"pointer",textDecoration:"underline" }}>Giriş yap</span>
                  {" "}veya{" "}
                  <span onClick={()=>onNeedAuth("register")} style={{ color:"#111",fontWeight:700,cursor:"pointer",textDecoration:"underline" }}>üye ol</span>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize:12, color:"#888", fontStyle:"italic", textAlign:"center", padding:"8px 0" }}>
              {dert.solved
                ? "⭐ Bu dert dermana ulaştı — derman yazılamaz"
                : isClosed
                ? "🔒 Bu dert kapatıldı — yeni derman yazılamaz"
                : "Bu senin derdin — sadece başkaları derman yazabilir"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Kategori uzmanlık unvanları ─────────────────────────── */
const CAT_TITLES = {
  İş:         ["İş Yeri Danışmanı","Kariyer Koçu","İş Hayatı Ustası"],
  Aile:       ["Aile Dostu","Aile Danışmanı","Aile Bilgesi"],
  Aşk:        ["Kalp Rehberi","Aşk Danışmanı","Aşk Ustası"],
  Arkadaşlık: ["Dost Eli","Arkadaşlık Rehberi","Dostluk Bilgesi"],
  Sağlık:     ["Can Dostu","Sağlık Danışmanı","Sağlık Bilgesi"],
  Para:        ["Bütçe Dostu","Para Danışmanı","Finans Uzmanı"],
};
function CSS() {
  return (
    <style>{[
      "@keyframes fu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes slideDown{from{opacity:0;max-height:0}to{opacity:1;max-height:2000px}}",
      "@keyframes sd{from{opacity:0;transform:translateX(-50%) translateY(-16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}",
      "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}",
      "@keyframes stampIn{from{opacity:0;transform:rotate(-8deg) scale(1.35)}to{opacity:1;transform:rotate(-8deg) scale(1)}}",
      "@keyframes newCard{0%{opacity:0;transform:translateY(-18px) scale(.97)}60%{transform:translateY(3px) scale(1.01)}100%{opacity:1;transform:translateY(0) scale(1)}}",
      ".dc{animation:fu .3s ease both}",
      ".stamp{animation:stampIn .4s cubic-bezier(.175,.885,.32,1.275) both}",
      ".dert-card{transition:transform .18s, box-shadow .18s}",
      ".dert-new{animation:newCard .5s cubic-bezier(.175,.885,.32,1.275) both;outline:2px solid #111;outline-offset:2px}",
      "@media(hover:hover){.dert-card:hover{transform:translateY(-2px)}}",
      "textarea:focus,input:focus,select:focus{outline:none;border-color:#111!important}",
      "::-webkit-scrollbar{width:3px;height:3px}",
      "::-webkit-scrollbar-thumb{background:#ddd;border-radius:2px}"
    ].join("\n")}</style>
  );
}

/* ─── Toast ────────────────────────────────────────────────── */
function Toast({ toast }) {
  const base = { position:"fixed", top:24, left:"50%", transform:"translateX(-50%)",
    zIndex:9999, fontFamily:"Georgia,serif", textAlign:"center",
    animation:"sd .4s ease", whiteSpace:"nowrap" };
  if (!toast) return null;
  if (toast.startsWith("solved_")) return (
    <div style={{ ...base, background:"#111", color:"#fff", padding:"16px 40px", boxShadow:"5px 5px 0 #555" }}>
      <div style={{ fontSize:10, letterSpacing:4, textTransform:"uppercase", opacity:.4, marginBottom:4 }}>✦ ✦ ✦ ✦ ✦</div>
      <div style={{ fontSize:18, fontWeight:900, letterSpacing:"-.5px" }}>Dert Dermana Ulaştu!</div>
      <div style={{ fontSize:10, opacity:.4, marginTop:4 }}>En iyi derman seçildi</div>
    </div>
  );
  if (toast.startsWith("closed_")) return (
    <div style={{ ...base, background:"#555", color:"#fff", padding:"14px 32px", boxShadow:"4px 4px 0 #333" }}>
      <div style={{ fontSize:14, fontWeight:700 }}>Derdim Gecti — Dert Kapatildi</div>
      <div style={{ fontSize:10, opacity:.5, marginTop:3 }}>Destek veren herkese tesekkurler</div>
    </div>
  );
  if (toast === "deleted") return (
    <div style={{ ...base, background:"#c0392b", color:"#fff", padding:"12px 28px", boxShadow:"4px 4px 0 #922b21" }}>
      <div style={{ fontSize:13, fontWeight:700 }}>Dert silindi</div>
    </div>
  );
  if (toast === "edit_dert") return (
    <div style={{ ...base, background:"#27ae60", color:"#fff", padding:"12px 28px", boxShadow:"4px 4px 0 #1a7a45" }}>
      <div style={{ fontSize:13, fontWeight:700 }}>Dert guncellendi</div>
    </div>
  );
  if (toast.startsWith("report_")) return (
    <div style={{ ...base, background:"#c0392b", color:"#fff", padding:"12px 28px", boxShadow:"4px 4px 0 #922b21" }}>
      <div style={{ fontSize:13, fontWeight:700 }}>Sikayet iletildi</div>
    </div>
  );
  return null;
}

/* ─── Root ────────────────────────────────────────────────── */
export default function Derthanem() {
  const [screen, setScreen]   = useState("landing");
  const [user,   setUser]     = useState(null);
  const [auth,   setAuth]     = useState(null);
  const [derts,  setDerts]    = useState([]);
  const [loading,setLoading]  = useState(true);
  const [tab,    setTab]      = useState("feed");
  const [cat,    setCat]      = useState("Hepsi");
  const [openId, setOpenId]   = useState(null);
  const [toast,  setToast]    = useState(null);
  const [dark,   setDark]     = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [seenNotifs, setSeenNotifs] = useState(new Set());
  const [welcomeMsg, setWelcomeMsg] = useState(null); // hoş geldin banner
  const [userAvatar, setUserAvatar] = useState(null);  // seçili emoji avatar
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [adminReports, setAdminReports] = useState([]);

  const isAdmin = user?.email === ADMIN_EMAIL || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const [showPost, setShowPost] = useState(false);
  const [postForm, setPostForm] = useState({ title:"", content:"", category:"İş", isAnon:false });
  const [postWarn, setPostWarn] = useState("");
  const [draft,   setDraft]    = useState(null);

  const [cTexts, setCTexts] = useState({});
  const [cWarns, setCWarns] = useState({});
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("new");

  /* ── Supabase: Tüm dertleri çek ── */
  const loadDerts = useCallback(async () => {
    const { data, error } = await supabase
      .from("derts")
      .select([
        "id,author_id,is_anon,title,content,category,solved,closed,created_at",
        "profiles!derts_author_id_fkey(name,gender)",
        "relates(user_id)",
        "comments(id,author_id,text,stars,owner_rated,badge,created_at,profiles!comments_author_id_fkey(name),likes(user_id))"
      ].join(","))
      .order("created_at", { ascending: false });
    if (!error && data) setDerts(data.map(mapDert));
    setLoading(false);
  }, []);

  /* ── Oturum kontrolü + veri yükleme ── */
  useEffect(() => {
    loadDerts();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles").select("*").eq("id", session.user.id).single();
        if (profile) {
          setUser({ id: session.user.id, name: profile.name,
            gender: profile.gender, email: session.user.email,
            registeredAt: new Date(profile.created_at).getTime() });
          setScreen("app");
        }
      }
    });

    /* Realtime: yeni dert/derman gelince otomatik yenile */
    const ch = supabase.channel("derthanem_rt")
      .on("postgres_changes", { event:"*", schema:"public", table:"derts"    }, loadDerts)
      .on("postgres_changes", { event:"*", schema:"public", table:"comments" }, loadDerts)
      .on("postgres_changes", { event:"*", schema:"public", table:"likes"    }, loadDerts)
      .on("postgres_changes", { event:"*", schema:"public", table:"relates"  }, loadDerts)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadDerts]);

  const board = useMemo(() => computeBoard(derts), [derts]);

  const notifications = useMemo(() => {
    if (!user) return [];
    const notifs = [];
    derts.filter(d=>d.authorId===user.id).forEach(d=>{
      d.comments.forEach(c=>{
        notifs.push({ id:`${d.id}_${c.id}`, dertId:d.id, dertTitle:d.title,
          author:c.author, text:c.text.slice(0,60)+(c.text.length>60?"…":""),
          rated:c.ownerRated, stars:c.stars, badge:c.badge });
      });
    });
    return notifs.reverse();
  }, [derts, user]);

  const unreadCount = notifications.filter(n=>!seenNotifs.has(n.id)).length;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const myExpertise = useMemo(() => {
    if (!user) return null;
    const catMap = {};
    derts.forEach(d=>d.comments.forEach(c=>{
      if (c.authorId===user.id && c.ownerRated)
        catMap[d.category]=(catMap[d.category]||0)+c.stars;
    }));
    const best = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];
    if (!best) return null;
    const score = best[1];
    const titles = CAT_TITLES[best[0]]||[];
    const titleIdx = score>=30?2:score>=15?1:score>=5?0:-1;
    return titleIdx>=0 ? { category:best[0], title:titles[titleIdx], score } : null;
  }, [derts, user]);

  const pendingRatings = useMemo(() => {
    if (!user) return 0;
    return derts.filter(d=>d.authorId===user.id&&!d.solved)
      .reduce((s,d)=>s+d.comments.filter(c=>!c.ownerRated).length, 0);
  }, [derts, user]);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null), 4000); };
  const handleAuth = async (u) => {
    setUser(u); setAuth(null); setScreen("app");
    await loadDerts();
    // Giriş sonrası bekleyen dermanları say
    const { data } = await supabase
      .from("comments")
      .select("id, dert_id, derts!inner(author_id)")
      .eq("derts.author_id", u.id)
      .eq("owner_rated", false);
    const count = data?.length || 0;
    if (count > 0) {
      setWelcomeMsg("Hoş geldin " + u.name + "! 🎉 Dertlerine " + count + " yeni derman geldi.");
    } else {
      setWelcomeMsg("Hoş geldin " + u.name + "!");
    }
    setTimeout(() => setWelcomeMsg(null), 5000);
  };
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setScreen("landing"); setDraft(null);
  };
  const needAuth = (m="login") => setAuth(m);

  /* ── Supabase handlers ── */
  const handleRate = async (dertId, commentId, stars) => {
    const badge = stars===10?"gold":stars>=8?"silver":null;
    // Önce UI'ı hemen güncelle (optimistic)
    setDerts(prev => prev.map(d => {
      if (d.id !== dertId) return d;
      const comments = d.comments.map(c =>
        c.id !== commentId ? c : { ...c, stars, ownerRated:true, badge }
      );
      return { ...d, comments, solved: stars===10 ? true : d.solved };
    }));
    if (stars===10) showToast("solved_"+dertId);
    // Sonra DB'ye yaz
    await supabase.from("comments")
      .update({ stars, owner_rated:true, badge }).eq("id", commentId);
    if (stars===10) {
      await supabase.from("derts").update({ solved:true }).eq("id", dertId);
    }
    await loadDerts();
  };

  const handleComment = async (dertId) => {
    if (!user) { needAuth("login"); return; }
    const text = (cTexts[dertId]||"").trim();
    if (!text) return;
    if (hasBanned(text)) { setCWarns(p=>({...p,[dertId]:warnMsg(text,user)})); return; }
    if (isNewAccount(user)&&/\d{10,}|@|\bwww\b|\.com/.test(text)) {
      setCWarns(p=>({...p,[dertId]:"⚠ Yeni hesaplar ilk 5 dakika iletişim bilgisi paylaşamaz."})); return;
    }
    if (isDuplicate(user.id,text)) {
      setCWarns(p=>({...p,[dertId]:"⚠ Aynı mesajı tekrar gönderemezsin."})); return;
    }
    setCWarns(p=>({...p,[dertId]:""}));
    const { error } = await supabase.from("comments")
      .insert({ dert_id:dertId, author_id:user.id, text:censorText(text) });
    if (!error) { setCTexts(p=>({...p,[dertId]:""})); setOpenId(dertId); await loadDerts(); }
  };

  const handleEdit = async (dertId, commentId, newText) => {
    await supabase.from("comments").update({ text:newText }).eq("id", commentId);
    await loadDerts();
  };

  const handleEditDert = async (dertId, form) => {
    await supabase.from("derts")
      .update({ title:form.title.trim(), content:form.content.trim() }).eq("id", dertId);
    showToast("edit_dert");
    await loadDerts();
  };

  const handleLike = async (dertId, commentId) => {
    if (!user) return;
    const dert = derts.find(d=>d.id===dertId);
    const comment = dert?.comments.find(c=>c.id===commentId);
    const already = (comment?.likedBy||[]).includes(user.id);
    if (already) {
      await supabase.from("likes").delete().eq("comment_id",commentId).eq("user_id",user.id);
    } else {
      await supabase.from("likes").insert({ comment_id:commentId, user_id:user.id });
    }
    await loadDerts();
  };

  const handleReport = async (dertId, commentId) => {
    if (!user) return;
    await supabase.from("reports").insert({
      reporter_id: user.id,
      dert_id: dertId || null,
      comment_id: commentId || null,
      reason: commentId ? "yorum sikayeti" : "dert sikayeti",
    });
    showToast("report_"+dertId+"_"+(commentId||"dert"));
  };

  const DAILY_LIMIT = 3;
  const todayDerts = useMemo(() => {
    if (!user) return 0;
    const start = new Date(); start.setHours(0,0,0,0);
    return derts.filter(d=>d.authorId===user.id && d.ts>=start.getTime()).length;
  }, [derts, user]);

  const handleRelate = async (dertId) => {
    if (!user) return;
    const dert = derts.find(d=>d.id===dertId);
    const already = (dert?.relatableBy||[]).includes(user.id);
    if (already) {
      await supabase.from("relates").delete().eq("dert_id",dertId).eq("user_id",user.id);
    } else {
      await supabase.from("relates").insert({ dert_id:dertId, user_id:user.id });
    }
    await loadDerts();
  };

  const handleClose = async (dertId) => {
    await supabase.from("derts").update({ closed:true }).eq("id", dertId);
    showToast("closed_"+dertId);
    await loadDerts();
  };

  const handleDeleteComment = async (dertId, commentId) => {
    await supabase.from("comments").delete().eq("id", commentId);
    setDerts(prev => prev.map(d => d.id!==dertId ? d : {
      ...d, comments: d.comments.filter(c => c.id!==commentId)
    }));
  };

  const handleDelete = async (dertId) => {
    await supabase.from("derts").delete().eq("id", dertId);
    if (openId===dertId) setOpenId(null);
    showToast("deleted");
    setDerts(prev=>prev.filter(d=>d.id!==dertId));
  };

  const stats = useMemo(() => computeStats(derts), [derts]);

  const handlePost = async () => {
    if (!postForm.title.trim()||!postForm.content.trim()) {
      setPostWarn("⚠ Başlık ve içerik boş bırakılamaz."); return;
    }
    if (todayDerts >= DAILY_LIMIT) {
      setPostWarn("⏱ Günlük " + DAILY_LIMIT + " dert limitine ulaştın."); return;
    }
    if (hasBanned(postForm.title)||hasBanned(postForm.content)) {
      setPostWarn(warnMsg(postForm.title)||warnMsg(postForm.content)); return;
    }
    setPostWarn("");
    const { data, error } = await supabase.from("derts").insert({
      author_id: user.id,
      title:     censorText(postForm.title),
      content:   censorText(postForm.content),
      category:  postForm.category,
      is_anon:   postForm.isAnon,
    }).select("id").single();
    if (error) { setPostWarn("⚠ Bir hata oluştu, tekrar dene."); return; }
    setPostForm({ title:"", content:"", category:"İş", isAnon:false });
    setDraft(null); setShowPost(false);
    setOpenId(data.id); setTab("feed");
    await loadDerts();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA"||e.target.tagName==="SELECT") return;
      if (screen!=="app") return;
      if (e.key==="n"||e.key==="N") { if (user) openPostForm(); else needAuth("login"); }
      if (e.key==="Escape") { setShowPost(false); setOpenId(null); setShowNotifs(false); }
      if (e.key==="f"||e.key==="F") { setTab("feed"); }
      if (e.key==="b"||e.key==="B") { setTab("board"); }
      if (e.key==="s"||e.key==="S") { setTab("stats"); }
    };
    window.addEventListener("keydown", handler);
    return ()=>window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, user, showPost]);

  const openPostForm = () => {
    if (draft) setPostForm(draft);
    setShowPost(true);
  };
  const closePostForm = () => {
    const hasContent = postForm.title.trim()||postForm.content.trim();
    if (hasContent) setDraft(postForm);
    setShowPost(false);
    setPostWarn("");
  };

  /* derived */
  const myDerts    = user ? derts.filter(d=>d.authorId===user.id) : [];
  const myComments = user ? derts.flatMap(d=>
    d.comments.filter(c=>c.authorId===user.id).map(c=>({...c,dertTitle:d.title,dertId:d.id}))
  ) : [];
  const ratedComs  = myComments.filter(c=>c.ownerRated);
  const myAvg      = ratedComs.length ? (ratedComs.reduce((a,c)=>a+c.stars,0)/ratedComs.length).toFixed(1) : null;
  const myGold     = ratedComs.filter(c=>c.badge==="gold").length;
  const mySilver   = ratedComs.filter(c=>c.badge==="silver").length;

  const filtered = useMemo(() => {
    let list = cat==="Hepsi" ? [...derts] : derts.filter(d=>d.category===cat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q)
      );
    }
    if (sortBy==="mostDerman") list.sort((a,b)=>b.comments.length-a.comments.length);
    else if (sortBy==="unrated") list = list.filter(d=>!d.solved&&d.comments.length===0);
    // "new" = default order (newest first, already inserted at top)
    return list;
  }, [derts, cat, search, sortBy]);

  /* ── Shared header ── */
  const bg0  = dark?"#111":"#fff";
  const bg1  = dark?"#1a1a1a":"#f7f7f5";
  const fg   = dark?"#fff":"#111";
  const bdr  = dark?"#333":"#111";
  const muted= dark?"#aaa":"#666";

  const Header = ({ title, left }) => (
    <div style={{ position:"sticky", top:0, zIndex:200, background:bg0,
      borderBottom:`2px solid ${bdr}`, display:"flex", alignItems:"center",
      justifyContent:"space-between", padding:"0 14px", height:56, minWidth:0, gap:8 }}>

      {/* Sol: logo */}
      <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, minWidth:0, overflow:"hidden" }}>
        {left}
        <div style={{ display:"flex", alignItems:"baseline", gap:5, minWidth:0, overflow:"hidden" }}>
          <span style={{ fontSize:18, fontWeight:900, letterSpacing:"-1px", color:fg,
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {title||"Derthanem"}
          </span>
          {!title && <span style={{ fontSize:9, letterSpacing:2, textTransform:"uppercase",
            opacity:.22, color:fg, flexShrink:0 }}>beta</span>}
        </div>
      </div>

      {/* Sağ: aksiyonlar — sıkıştırılmaz */}
      <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
        {/* Karanlık mod */}
        <button onClick={()=>setDark(d=>!d)}
          style={{ background:"none", border:`1.5px solid ${bdr}`, cursor:"pointer",
            padding:"5px 8px", fontSize:13, color:fg, lineHeight:1, flexShrink:0 }}>
          {dark?"☀":"🌙"}
        </button>

        {user ? (
          <>
            {/* Bildirim çanı */}
            {screen==="app" && (
              <div style={{ position:"relative", flexShrink:0 }}>
                <button onClick={e=>{
                  e.stopPropagation();
                  setShowNotifs(v=>!v);
                  setSeenNotifs(new Set(notifications.map(n=>n.id)));
                }} style={{ background:"none", border:`1.5px solid ${bdr}`,
                  cursor:"pointer", padding:"5px 8px", fontSize:14, color:fg, lineHeight:1 }}>
                  🔔
                </button>
                {unreadCount>0 && (
                  <span style={{ position:"absolute", top:-5, right:-5,
                    background:"#c0392b", color:"#fff", borderRadius:"50%",
                    width:16, height:16, fontSize:9, fontWeight:900,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    border:"2px solid "+bg0, pointerEvents:"none" }}>
                    {unreadCount>9?"9+":unreadCount}
                  </span>
                )}
                {showNotifs && (
                  <div style={{ position:"fixed", top:58, right:14, zIndex:500,
                    background:bg0, border:`2px solid ${bdr}`,
                    boxShadow:`5px 5px 0 ${dark?"#333":"#111"}`,
                    width:"min(290px, calc(100vw - 28px))", maxHeight:360, overflowY:"auto",
                    fontFamily:"'Georgia',serif" }}>
                    <div style={{ padding:"10px 14px", borderBottom:`1.5px solid ${bdr}`,
                      fontSize:10, fontWeight:700, letterSpacing:2,
                      textTransform:"uppercase", color:muted }}>Bildirimler</div>
                    {notifications.length===0 ? (
                      <div style={{ padding:20, textAlign:"center", fontSize:12, color:muted }}>
                        Henüz bildirim yok</div>
                    ) : notifications.map(n=>(
                      <div key={n.id} onClick={()=>{
                        setShowNotifs(false); setTab("feed");
                        setCat("Hepsi"); setOpenId(n.dertId);
                      }} style={{ padding:"10px 14px",
                        borderBottom:`1px solid ${dark?"#2a2a2a":"#f0f0f0"}`,
                        cursor:"pointer", background: seenNotifs.has(n.id)
                          ? bg0 : (dark?"#1e1e1e":"#fffbf0") }}>
                        <div style={{ fontSize:11, fontWeight:700, color:fg,
                          marginBottom:3, lineHeight:1.4 }}>
                          <span style={{ color:muted }}>"{n.dertTitle.slice(0,28)}{n.dertTitle.length>28?"…":""}"</span>
                          {" "}→ <span style={{ color:fg }}>{n.author}</span>
                        </div>
                        <div style={{ fontSize:11, color:muted, lineHeight:1.5 }}>{n.text}</div>
                        {n.rated && (
                          <div style={{ fontSize:10, color:"#f39c12", fontWeight:700, marginTop:4 }}>
                            {n.badge==="gold"?"⭐ Altın Derman":n.badge==="silver"?"✦ Gümüş Derman":`★ ${n.stars}/10`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Derdini dök */}
            {screen==="app" && (
              <div style={{ position:"relative", flexShrink:0 }}>
                <button onClick={()=>showPost?closePostForm():openPostForm()}
                  style={{ background:showPost?bg0:"#111", color:showPost?fg:"#fff",
                    border:`2px solid ${showPost?bdr:"#111"}`,
                    padding:"6px 12px", cursor:"pointer", fontFamily:"'Georgia',serif",
                    fontSize:11, fontWeight:700, letterSpacing:.5, transition:"all .15s",
                    whiteSpace:"nowrap" }}>
                  {showPost?"✕":"+ Derdini Dök"}
                </button>
                {draft && !showPost && (
                  <span style={{ position:"absolute", top:-5, right:-5,
                    background:"#f39c12", color:"#fff", borderRadius:3,
                    fontSize:8, fontWeight:900, padding:"1px 5px",
                    border:"2px solid "+bg0, letterSpacing:1, pointerEvents:"none" }}>
                    TASLAK
                  </span>
                )}
              </div>
            )}

            {/* Admin butonu — sadece admin kullanıcıya görünür */}
            {isAdmin && (
              <button onClick={async()=>{
                const { data } = await supabase.from("reports")
                  .select("*, profiles(name)")
                  .order("created_at", { ascending:false });
                setAdminReports(data||[]);
                setScreen("admin");
              }} style={{ background:"#c0392b", color:"#fff",
                border:"2px solid #c0392b", padding:"6px 10px", cursor:"pointer",
                fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700,
                flexShrink:0 }}>🚩 Admin</button>
            )}
            {/* Geçici debug — sonra sileceğiz */}
            {user && !isAdmin && (
              <span style={{ fontSize:9, color:"#aaa", maxWidth:100, overflow:"hidden",
                textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={user.email}>
                {user.email}
              </span>
            )}

            {/* Profil — sadece avatar + isim (isim mobilde gizli) */}
            <div onClick={()=>{ setShowNotifs(false); setScreen(screen==="profile"?"app":"profile"); }}
              style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer",
                padding:"5px 8px", border:`2px solid ${bdr}`,
                transition:"all .15s", position:"relative", color:fg, flexShrink:0 }}>
              <Av char={user.name[0].toUpperCase()} inv={!dark} size={24}/>
              <span className="hdr-name" style={{ fontSize:12, fontWeight:700 }}>{user.name}</span>
              {pendingRatings>0 && (
                <span style={{ position:"absolute", top:-7, right:-7,
                  background:"#c0392b", color:"#fff", width:17, height:17,
                  borderRadius:"50%", fontSize:9, fontWeight:900,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  border:"2px solid "+bg0, pointerEvents:"none" }}>{pendingRatings}</span>
              )}
            </div>
            <style>{`@media(max-width:480px){.hdr-name{display:none!important}}`}</style>
          </>
        ) : (
          <>
            <button onClick={()=>needAuth("login")} style={{ background:bg0, color:fg,
              border:`2px solid ${bdr}`, padding:"6px 12px", cursor:"pointer",
              fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700,
              whiteSpace:"nowrap" }}>Giriş</button>
            <button onClick={()=>needAuth("register")} style={{ background:"#111", color:"#fff",
              border:"2px solid #111", padding:"6px 12px", cursor:"pointer",
              fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700,
              boxShadow:"3px 3px 0 #555", whiteSpace:"nowrap" }}>Üye Ol</button>
          </>
        )}
      </div>
    </div>
  );

  /* ══ LANDING ══ */
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", fontFamily:"Georgia,serif", flexDirection:"column", gap:16,
      background:"#fff" }}>
      <div style={{ fontSize:22, fontWeight:900, letterSpacing:"-1px" }}>Derthanem</div>
      <div style={{ fontSize:11, letterSpacing:3, textTransform:"uppercase", color:"#777",
        animation:"pulse 1.2s ease infinite" }}>yükleniyor...</div>
      <CSS/>
    </div>
  );

  if (screen==="landing") return (
    <>
      <CSS/>
      <Toast toast={toast}/>
      <Landing onDert={()=>needAuth("register")} onDerman={()=>setScreen("app")}/>
      {auth && <AuthModal mode={auth} onClose={()=>setAuth(null)} onAuth={handleAuth}/>}
    </>
  );

  /* ══ PROFILE ══ */
  /* ══ ADMIN ══ */
  if (screen==="admin" && isAdmin) return (
    <div style={{ minHeight:"100vh", background:"#f7f7f5", fontFamily:"'Georgia',serif" }}>
      <CSS/><Toast toast={toast}/>
      <Header left={
        <button onClick={()=>setScreen("app")} style={{ background:"none", border:"none",
          cursor:"pointer", fontFamily:"'Georgia',serif", fontSize:13, fontWeight:700,
          marginRight:4, padding:"4px 8px" }}>← Geri</button>
      }/>
      <div style={{ maxWidth:800, margin:"0 auto", padding:"28px 16px 60px" }}>
        <div style={{ fontSize:9, letterSpacing:4, textTransform:"uppercase", color:"#aaa", marginBottom:6 }}>Yönetim Paneli</div>
        <div style={{ fontSize:26, fontWeight:900, letterSpacing:"-1px", marginBottom:24 }}>Şikayet Kutusu</div>

        {adminReports.length === 0 ? (
          <div style={{ border:"2px dashed #ddd", padding:"40px 20px", textAlign:"center", color:"#aaa" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
            <div style={{ fontSize:14, fontWeight:700 }}>Şikayet yok — her şey temiz!</div>
          </div>
        ) : (
          adminReports.map(r => (
            <div key={r.id} style={{ background:"#fff", border:"2px solid #111",
              padding:"18px 20px", marginBottom:12, boxShadow:"3px 3px 0 #111" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:2,
                    textTransform:"uppercase", color:"#c0392b", marginBottom:6 }}>
                    🚩 {r.reason}
                  </div>
                  <div style={{ fontSize:12, color:"#666", marginBottom:4 }}>
                    <strong>Şikayet eden:</strong> {r.profiles?.name || "?"} ({r.reporter_id?.slice(0,8)}...)
                  </div>
                  {r.dert_id && (
                    <div style={{ fontSize:12, color:"#666", marginBottom:4 }}>
                      <strong>Dert ID:</strong> {r.dert_id}
                    </div>
                  )}
                  {r.comment_id && (
                    <div style={{ fontSize:12, color:"#666", marginBottom:4 }}>
                      <strong>Yorum ID:</strong> {r.comment_id}
                    </div>
                  )}
                  <div style={{ fontSize:11, color:"#aaa" }}>
                    {new Date(r.created_at).toLocaleString("tr-TR")}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {r.dert_id && (
                    <button onClick={()=>{
                      setScreen("app"); setTab("feed"); setCat("Hepsi");
                      setOpenId(r.dert_id);
                      setTimeout(()=>{
                        const el = document.getElementById("dert-"+r.dert_id);
                        if (el) el.scrollIntoView({ behavior:"smooth", block:"center" });
                      }, 300);
                    }} style={{ padding:"6px 14px", background:"#111", color:"#fff",
                      border:"2px solid #111", cursor:"pointer",
                      fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700 }}>
                      Derte Git →
                    </button>
                  )}
                  {/* Şikayet edilen içeriği sil */}
                  {r.comment_id && (
                    <button onClick={async()=>{
                      if (!window.confirm("Bu dermanı silmek istiyor musun?")) return;
                      await supabase.from("comments").delete().eq("id", r.comment_id);
                      await supabase.from("reports").delete().eq("id", r.id);
                      setAdminReports(prev=>prev.filter(x=>x.id!==r.id));
                      await loadDerts();
                    }} style={{ padding:"6px 14px", background:"#c0392b", color:"#fff",
                      border:"2px solid #c0392b", cursor:"pointer",
                      fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700 }}>
                      Dermanı Sil
                    </button>
                  )}
                  {r.dert_id && !r.comment_id && (
                    <button onClick={async()=>{
                      if (!window.confirm("Bu derdi silmek istiyor musun?")) return;
                      await supabase.from("derts").delete().eq("id", r.dert_id);
                      await supabase.from("reports").delete().eq("id", r.id);
                      setAdminReports(prev=>prev.filter(x=>x.id!==r.id));
                      await loadDerts();
                    }} style={{ padding:"6px 14px", background:"#c0392b", color:"#fff",
                      border:"2px solid #c0392b", cursor:"pointer",
                      fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700 }}>
                      Derdi Sil
                    </button>
                  )}
                  <button onClick={async()=>{
                    await supabase.from("reports").delete().eq("id", r.id);
                    setAdminReports(prev=>prev.filter(x=>x.id!==r.id));
                  }} style={{ padding:"6px 14px", background:"#fff", color:"#666",
                    border:"2px solid #ddd", cursor:"pointer",
                    fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700 }}>
                    Yoksay
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Genel istatistikler */}
        <div style={{ marginTop:32, borderTop:"2px solid #111", paddingTop:24 }}>
          <div style={{ fontSize:13, fontWeight:700, letterSpacing:1, marginBottom:16 }}>Genel Durum</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            {[
              ["Toplam Dert", derts.length, "📋"],
              ["Çözülen", derts.filter(d=>d.solved).length, "⭐"],
              ["Açık Şikayet", adminReports.length, "🚩"],
            ].map(([label, val, icon])=>(
              <div key={label} style={{ border:"2px solid #111", padding:"16px", textAlign:"center" }}>
                <div style={{ fontSize:24 }}>{icon}</div>
                <div style={{ fontSize:28, fontWeight:900, marginTop:6 }}>{val}</div>
                <div style={{ fontSize:10, color:"#666", letterSpacing:1, textTransform:"uppercase", marginTop:4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (screen==="profile" && user) return (
    <div style={{ minHeight:"100vh", background:bg1, fontFamily:"'Georgia',serif", color:fg }}>
      <CSS/><Toast toast={toast}/>
      <Header left={
        <button onClick={()=>setScreen("app")} style={{ background:"none", border:"none",
          cursor:"pointer", fontFamily:"'Georgia',serif", fontSize:13, fontWeight:700,
          marginRight:4, padding:"4px 8px", display:"flex", alignItems:"center", gap:4 }}>← Geri</button>
      }/>

      <div style={{ maxWidth:700, margin:"0 auto", padding:"24px 16px 60px" }}>

        {/* Profile hero */}
        <div style={{ background:"#111", color:"#fff", border:"2px solid #111",
          padding:"26px 26px", marginBottom:20, boxShadow:"6px 6px 0 #444" }}>
          <div style={{ display:"flex", alignItems:"center", gap:18, flexWrap:"wrap" }}>
            {/* Avatar — tıklanabilir emoji seçici */}
            <div style={{ position:"relative" }}>
              <div onClick={()=>setShowAvatarPicker(v=>!v)}
                style={{ width:60, height:60, borderRadius:"50%", background:"rgba(255,255,255,.15)",
                  border:"2px solid rgba(255,255,255,.3)", display:"flex", alignItems:"center",
                  justifyContent:"center", fontSize:28, cursor:"pointer", userSelect:"none" }}>
                {userAvatar || user.name[0].toUpperCase()}
              </div>
              {showAvatarPicker && (
                <div style={{ position:"absolute", top:68, left:0, zIndex:500,
                  background:"#fff", border:"2px solid #111", boxShadow:"4px 4px 0 #333",
                  padding:10, display:"flex", flexWrap:"wrap", gap:6, width:200 }}>
                  {["😊","😎","🤗","🦁","🐺","🦊","🐻","🐼","🐨","🦋","🌻","⭐","🔥","💫","🎯","💙"].map(e=>(
                    <button key={e} onClick={()=>{ setUserAvatar(e); setShowAvatarPicker(false); }}
                      style={{ fontSize:22, border:"none", cursor:"pointer",
                        padding:4, borderRadius:4,
                        background: userAvatar===e ? "#f0f0f0" : "none" }}>{e}</button>
                  ))}
                  <button onClick={()=>{ setUserAvatar(null); setShowAvatarPicker(false); }}
                    style={{ fontSize:10, background:"none", border:"1px solid #ddd",
                      cursor:"pointer", padding:"3px 8px", color:"#666", width:"100%" }}>
                    Varsayılan
                  </button>
                </div>
              )}
            </div>
            <div style={{ flex:1, minWidth:120 }}>
              <div style={{ fontSize:22, fontWeight:900, letterSpacing:"-.5px" }}>{user.name}</div>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase",
                opacity:.4, marginTop:4 }}>
                {user.gender==="female"?"Dert Anası":"Dert Babası"}
                {myAvg && ` · Ort. ${myAvg}/10`}
              </div>
              {(myGold>0||mySilver>0) && (
                <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
                  {myGold>0 && <Badge type="gold"/>}
                  {mySilver>0 && <Badge type="silver"/>}
                </div>
              )}
              {myExpertise && (
                <div style={{ marginTop:10, display:"inline-flex", alignItems:"center",
                  gap:7, padding:"5px 12px",
                  border:"1.5px solid rgba(255,255,255,.25)",
                  borderRadius:3 }}>
                  <span style={{ fontSize:14 }}>{CAT_ICONS[myExpertise.category]}</span>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5,
                      textTransform:"uppercase", opacity:.5 }}>Uzmanlık Unvanı</div>
                    <div style={{ fontSize:13, fontWeight:800 }}>{myExpertise.title}</div>
                  </div>
                </div>
              )}
            </div>
            {/* Stats */}
            <div style={{ display:"flex", gap:0 }}>
              {[
                ["Dert",myDerts.length],
                ["Derman",myComments.length],
                ["Çözülen",myDerts.filter(d=>d.solved).length],
                ["Ort.", myAvg?`${myAvg}`:"-"],
              ].map(([l,v],i) => (
                <div key={l} style={{ textAlign:"center", padding:"0 16px",
                  borderLeft: i>0?"1px solid rgba(255,255,255,.12)":"none" }}>
                  <div style={{ fontSize:22, fontWeight:900, lineHeight:1 }}>{v}</div>
                  <div style={{ fontSize:9, fontWeight:700, letterSpacing:2,
                    textTransform:"uppercase", opacity:.35, marginTop:4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* My Derts */}
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:3, textTransform:"uppercase",
          color:"#777", marginBottom:14 }}>Dertlerim ({myDerts.length})</div>

        {myDerts.length===0 ? (
          <div style={{ border:"2px dashed #ddd", padding:"32px", textAlign:"center",
            color:"#888", fontSize:13, marginBottom:24 }}>
            Henüz dert paylaşmadın<br/>
            <span onClick={()=>{setScreen("app");setShowPost(true);}}
              style={{ fontSize:12, color:"#111", fontWeight:700, cursor:"pointer",
                textDecoration:"underline", display:"inline-block", marginTop:8 }}>
              İlk derdini paylaş →
            </span>
          </div>
        ) : myDerts.map((d,i) => <DertCard key={d.id} dert={d} i={i}
            user={user} openId={openId} setOpenId={setOpenId}
            cTexts={cTexts} setCTexts={setCTexts} cWarns={cWarns} setCWarns={setCWarns}
            onRate={handleRate} onComment={handleComment} onEdit={handleEdit}
            onEditDert={handleEditDert} onRelate={handleRelate} onClose={handleClose} onDelete={handleDelete} onDeleteComment={handleDeleteComment} onLike={handleLike} onReport={handleReport} onNeedAuth={needAuth} dark={dark} userAvatar={userAvatar}/>)}

        {/* My Comments */}
        {myComments.length>0 && <>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:3, textTransform:"uppercase",
            color:"#777", marginBottom:14, marginTop:24 }}>Dermanlarım ({myComments.length})</div>
          {myComments.map(c => (
            <div key={c.id} style={{ background:"#fff", border:"2px solid #111",
              padding:"14px 18px", marginBottom:10 }}>
              <div style={{ fontSize:9, color:"#777", fontWeight:700, letterSpacing:1.5,
                textTransform:"uppercase", marginBottom:8,
                wordBreak:"break-word" }}>"{c.dertTitle}"</div>
              <p style={{ margin:"0 0 10px", fontSize:13, lineHeight:1.75,
                wordBreak:"break-word" }}>{c.text}</p>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                {c.ownerRated ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0 }}>
                    <ScoreBar value={c.stars} inv={false}/>
                    {c.badge && <Badge type={c.badge}/>}
                  </div>
                ) : (
                  <span style={{ fontSize:11, color:"#888", fontStyle:"italic" }}>Henüz puanlanmadı</span>
                )}
              </div>
            </div>
          ))}
        </>}

        <div style={{ marginTop:20, textAlign:"center" }}>
          <button onClick={handleLogout} style={{ background:"#fff", color:"#666",
            border:"2px solid #ddd", padding:"10px 24px",
            fontFamily:"'Georgia',serif", fontSize:12, cursor:"pointer", fontWeight:700,
            letterSpacing:1 }}>Çıkış Yap</button>
        </div>
      </div>

      {auth && <AuthModal mode={auth} onClose={()=>setAuth(null)} onAuth={handleAuth}/>}
    </div>
  );

  /* ══ APP ══ */
  return (
    <div style={{ minHeight:"100vh", background:bg1, fontFamily:"'Georgia',serif", color:fg }}
      onClick={()=>showNotifs&&setShowNotifs(false)}>
      <CSS/><Toast toast={toast}/>
      <Header/>

      <div style={{ maxWidth:700, margin:"0 auto", padding:"0 16px 60px" }}>

        {/* Post form */}
        {showPost && user && (
          <div className="dc" style={{ margin:"20px 0 0", background:bg0,
            border:`2px solid ${bdr}`, padding:"22px 24px",
            boxShadow:`6px 6px 0 ${dark?"#333":"#111"}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <Av char={user.name[0].toUpperCase()} inv={!dark} size={36}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, color:fg }}>
                  {postForm.isAnon?"Anonim olarak":user.name}
                </div>
                <div style={{ fontSize:9, color:muted, letterSpacing:1.5, textTransform:"uppercase" }}>
                  {draft?"taslaktan devam":"yeni dert"}
                </div>
              </div>
              {/* Anon toggle */}
              <div onClick={()=>setPostForm(p=>({...p,isAnon:!p.isAnon}))}
                style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", flexShrink:0 }}>
                <div style={{ width:34, height:18, borderRadius:9, position:"relative",
                  background:postForm.isAnon?"#111":"#ddd", border:"1.5px solid #aaa",
                  transition:"background .2s" }}>
                  <div style={{ position:"absolute", top:1,
                    left:postForm.isAnon?14:1, width:14, height:14,
                    background:"#fff", borderRadius:"50%", border:"1px solid #bbb",
                    transition:"left .2s" }}/>
                </div>
                <span style={{ fontSize:10, fontWeight:700, letterSpacing:1.5,
                  textTransform:"uppercase", color:postForm.isAnon?"#111":"#aaa" }}>Anonim</span>
              </div>
            </div>

            <select value={postForm.category}
              onChange={e=>setPostForm(p=>({...p,category:e.target.value}))}
              style={{ padding:"8px 12px", marginBottom:10, border:"2px solid #ddd",
                fontFamily:"'Georgia',serif", fontSize:11, background:"#fff",
                cursor:"pointer", fontWeight:700, letterSpacing:1, textTransform:"uppercase" }}>
              {CATS.slice(1).map(c=><option key={c}>{c}</option>)}
            </select>

            <input value={postForm.title}
              onChange={e=>{setPostForm(p=>({...p,title:e.target.value}));setPostWarn("");}}
              placeholder="Derdini tek cümleyle özetle…"
              style={{ width:"100%", padding:"12px 13px", marginBottom:8,
                border:`2px solid ${postWarn&&!postForm.title.trim()?"#c0392b":"#ddd"}`,
                boxSizing:"border-box", fontFamily:"'Georgia',serif",
                fontSize:15, fontWeight:700, background:bg0, color:fg, outline:"none" }}/>

            <textarea value={postForm.content}
              onChange={e=>{setPostForm(p=>({...p,content:e.target.value}));setPostWarn("");}}
              placeholder="Olanları anlat. Burada herkes seni dinliyor…" rows={4}
              style={{ width:"100%", padding:"12px 13px", marginBottom:8,
                border:`2px solid ${postWarn&&!postForm.content.trim()?"#c0392b":"#ddd"}`,
                boxSizing:"border-box",
                fontFamily:"'Georgia',serif", fontSize:14, resize:"vertical",
                lineHeight:1.8, background:bg0, color:fg, outline:"none" }}/>

            {/* Günlük limit göstergesi */}
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
              {[...Array(DAILY_LIMIT)].map((_,i)=>(
                <div key={i} style={{ width:28, height:6,
                  background: i<todayDerts ? "#c0392b" : dark?"#333":"#eee",
                  borderRadius:3, transition:"background .3s" }}/>
              ))}
              <span style={{ fontSize:10, color:muted, letterSpacing:.5 }}>
                {DAILY_LIMIT-todayDerts} dert hakkı kaldı
              </span>
            </div>

            {postWarn && <div style={{ fontSize:11, color:"#c0392b", marginBottom:8, fontWeight:700 }}>{postWarn}</div>}

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={handlePost} style={{ flex:1, padding:"12px",
                background:"#111", color:"#fff", border:"2px solid #111",
                fontFamily:"'Georgia',serif", fontSize:13, fontWeight:700,
                cursor:"pointer", letterSpacing:1, boxShadow:"4px 4px 0 #555" }}>
                Derdimi Paylaş →
              </button>
              <button onClick={closePostForm}
                style={{ padding:"12px 18px", background:bg0,
                  border:`2px solid ${dark?"#333":"#ddd"}`, fontFamily:"'Georgia',serif",
                  fontSize:13, cursor:"pointer", color:fg }}>Vazgeç</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:`2px solid ${bdr}`, marginTop:24 }}>
          {[["feed","Dertler"],["board","Dert Ustaları"],["stats","İstatistikler"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} style={{ padding:"11px 16px", border:"none",
              fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700,
              cursor:"pointer", letterSpacing:1.5, textTransform:"uppercase",
              color:tab===id?"#fff":"#888", background:tab===id?"#111":"transparent" }}>{lbl}</button>
          ))}
          {/* Klavye kısayol ipucu — sadece geniş ekran */}
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6,
            paddingRight:4, opacity:.25, flexShrink:0,
            overflow:"hidden", maxWidth:220 }}>
            {[["N","yeni"],["F","feed"],["B","board"],["Esc","kapat"]].map(([k,l])=>(
              <span key={k} style={{ fontSize:9, fontFamily:"monospace", fontWeight:700,
                whiteSpace:"nowrap", display:"none" }} className="kbd-hint">
                <span style={{ background:fg, color:bg0, padding:"1px 4px", borderRadius:2 }}>{k}</span>
                {" "}{l}
              </span>
            ))}
          </div>
          <style>{`@media(min-width:520px){.kbd-hint{display:inline!important}}`}</style>
        </div>

        {/* Hoş geldin banner */}
        {welcomeMsg && (
          <div style={{ background:"#111", color:"#fff", padding:"13px 18px",
            marginTop:16, display:"flex", alignItems:"center", justifyContent:"space-between",
            fontFamily:"'Georgia',serif", fontSize:13, fontWeight:700,
            boxShadow:"4px 4px 0 #333", animation:"fu .4s ease" }}>
            <span>{welcomeMsg}</span>
            <button onClick={()=>setWelcomeMsg(null)} style={{ background:"none", border:"none",
              color:"rgba(255,255,255,.5)", cursor:"pointer", fontSize:16, padding:"0 4px" }}>✕</button>
          </div>
        )}

        {/* ── FEED ── */}
        {tab==="feed" && (<>

          {/* Arama */}
          <div style={{ margin:"16px 0 0", position:"relative" }}>
            <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)",
              fontSize:14, opacity:.35, pointerEvents:"none" }}>🔍</span>
            <input
              value={search}
              onChange={e=>setSearch(e.target.value)}
              placeholder="Dertlerde ara…"
              style={{ width:"100%", padding:"10px 13px 10px 36px", boxSizing:"border-box",
                border:"2px solid #ddd", fontFamily:"'Georgia',serif", fontSize:13,
                background:"#fff", color:"#111", outline:"none" }}
            />
            {search && (
              <button onClick={()=>setSearch("")}
                style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
                  background:"none", border:"none", cursor:"pointer", fontSize:16,
                  color:"#777", lineHeight:1 }}>✕</button>
            )}
          </div>

          {/* Sıralama */}
          <div style={{ display:"flex", gap:6, padding:"10px 0 0",
            overflowX:"auto", scrollbarWidth:"none", WebkitOverflowScrolling:"touch" }}>
            <style>{`.sort-scroll::-webkit-scrollbar{display:none}`}</style>
            {[["new","🕐 En Yeni"],["mostDerman","💬 En Çok Derman"],["unrated","⏳ Derman Bekleyenler"]].map(([v,l])=>(
              <button key={v} onClick={()=>setSortBy(v)}
                style={{ flexShrink:0, padding:"5px 11px", fontSize:10, fontWeight:700,
                  letterSpacing:.5, textTransform:"uppercase",
                  background:sortBy===v?"#111":bg0, color:sortBy===v?"#fff":muted,
                  border:`1.5px solid ${sortBy===v?"#111":dark?"#333":"#ddd"}`,
                  cursor:"pointer", fontFamily:"'Georgia',serif",
                  transition:"all .15s", whiteSpace:"nowrap" }}>{l}</button>
            ))}
          </div>

          {/* Kategoriler */}
          <div style={{ display:"flex", gap:6, overflowX:"auto", padding:"12px 0 10px", scrollbarWidth:"none" }}>
            {CATS.map(c=>(
              <button key={c} onClick={()=>setCat(c)}
                style={{ flexShrink:0, padding:"6px 13px",
                  background:cat===c?"#111":"#fff", color:cat===c?"#fff":"#555",
                  border:"2px solid #111", cursor:"pointer",
                  fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700,
                  display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap",
                  transition:"all .15s" }}>
                <span>{CAT_ICONS[c]}</span>{c}
              </button>
            ))}
          </div>

          {/* Sonuç / boş durumlar */}
          {search && (
            <div style={{ fontSize:11, color:"#777", marginBottom:10, letterSpacing:.5 }}>
              "{search}" için {filtered.length} sonuç
            </div>
          )}
          {filtered.length===0 && (
            <div style={{ border:"2px dashed #ddd", padding:32, textAlign:"center", color:"#888", fontSize:13 }}>
              {search ? "Arama sonucu bulunamadı" : "Bu kategoride henüz dert yok"}
            </div>
          )}
          {filtered.map((d,i) => {
            // Çözüme kavuşmamış ve 24+ saat eski dertlere otomatik badge
            const isUnsolved = !d.solved && d.comments.length===0;
            return (
              <div key={d.id} style={{ position:"relative" }}>
                {isUnsolved && (
                  <div style={{
                    position:"absolute", top:12, right:12, zIndex:2,
                    fontSize:9, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase",
                    background:"#fff3cd", color:"#856404",
                    border:"1.5px solid #ffc107", padding:"3px 8px",
                    pointerEvents:"none"
                  }}>⏳ Derman Bekleniyor</div>
                )}
                <DertCard dert={d} i={i} isNew={!!d.isNew}
                  user={user} openId={openId} setOpenId={setOpenId}
                  cTexts={cTexts} setCTexts={setCTexts} cWarns={cWarns} setCWarns={setCWarns}
                  onRate={handleRate} onComment={handleComment} onEdit={handleEdit}
                  onEditDert={handleEditDert} onRelate={handleRelate} onClose={handleClose} onDelete={handleDelete} onDeleteComment={handleDeleteComment} onLike={handleLike} onReport={handleReport} onNeedAuth={needAuth} dark={dark} userAvatar={userAvatar}/>
              </div>
            );
          })}
        </>)}

        {/* ── LEADERBOARD ── */}
        {tab==="board" && (
          <div style={{ paddingTop:22 }}>
            <div style={{ paddingBottom:18, marginBottom:20, borderBottom:`2px solid ${bdr}` }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:4,
                textTransform:"uppercase", color:muted, marginBottom:5 }}>Topluluk Şampiyonları</div>
              <div style={{ fontSize:26, fontWeight:900, letterSpacing:"-1px", color:fg }}>Dert Ustaları</div>
              <div style={{ fontSize:12, color:muted, marginTop:4 }}>
                Puan ortalaması en yüksek dermanlar
              </div>
            </div>

            {board.length===0 ? (
              <div style={{ border:"2px dashed #ddd", padding:32, textAlign:"center", color:"#888", fontSize:13 }}>
                Henüz puanlama yapılmadı — ilk dermanı yaz!
              </div>
            ) : (<>
              {/* PODYUM — İlk 3 */}
              {board.length>=1 && (
                <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"center",
                  gap:8, marginBottom:24, padding:"0 8px" }}>
                  {/* 2. */}
                  {board.length>=2 && (
                    <div style={{ flex:1, textAlign:"center" }}>
                      <Av char={board[1].avatar} inv={!dark} size={44}/>
                      <div style={{ fontSize:11, fontWeight:800, marginTop:8, color:fg,
                        wordBreak:"break-word" }}>{board[1].name}</div>
                      <div style={{ fontSize:18, fontWeight:900, color:fg }}>{board[1].avg}
                        <span style={{ fontSize:10, opacity:.4 }}>/10</span></div>
                      <div style={{ height:60, background:dark?"#333":"#e8e8e8",
                        border:`2px solid ${bdr}`, marginTop:8, display:"flex",
                        alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontSize:20, opacity:.5 }}>2</span>
                      </div>
                    </div>
                  )}
                  {/* 1. */}
                  <div style={{ flex:1, textAlign:"center" }}>
                    <div style={{ fontSize:22, marginBottom:4 }}>👑</div>
                    <Av char={board[0].avatar} inv size={56}/>
                    <div style={{ fontSize:13, fontWeight:800, marginTop:8, color:fg,
                      wordBreak:"break-word" }}>{board[0].name}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:fg }}>{board[0].avg}
                      <span style={{ fontSize:11, opacity:.4 }}>/10</span></div>
                    <div style={{ height:90, background:"#111",
                      border:"2px solid #111", marginTop:8, display:"flex",
                      alignItems:"center", justifyContent:"center",
                      boxShadow:"4px 4px 0 #555" }}>
                      <span style={{ fontSize:24, color:"#fff", opacity:.3 }}>1</span>
                    </div>
                  </div>
                  {/* 3. */}
                  {board.length>=3 && (
                    <div style={{ flex:1, textAlign:"center" }}>
                      <Av char={board[2].avatar} inv={!dark} size={40}/>
                      <div style={{ fontSize:11, fontWeight:800, marginTop:8, color:fg,
                        wordBreak:"break-word" }}>{board[2].name}</div>
                      <div style={{ fontSize:16, fontWeight:900, color:fg }}>{board[2].avg}
                        <span style={{ fontSize:10, opacity:.4 }}>/10</span></div>
                      <div style={{ height:44, background:dark?"#333":"#e8e8e8",
                        border:`2px solid ${bdr}`, marginTop:8, display:"flex",
                        alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontSize:16, opacity:.5 }}>3</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. ve sonrası — liste */}
              {board.slice(3).map((u,i)=>(
                <div key={u.authorId} style={{ background:bg0, color:fg,
                  border:`2px solid ${bdr}`, padding:"14px 20px", marginBottom:8,
                  display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ fontSize:10, fontWeight:900, minWidth:22,
                    opacity:.3, fontFamily:"monospace", flexShrink:0 }}>0{i+4}</div>
                  <Av char={u.avatar} inv={!dark} size={36}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:800, fontSize:14 }}>{u.name}</div>
                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:2,
                      textTransform:"uppercase", opacity:.4, marginTop:3 }}>
                      {u.gold>0?"★ Altın Derman":u.silver>0?"✦ Gümüş Derman":"Derman Yazarı"}
                    </div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:20, fontWeight:900 }}>{u.avg}
                      <span style={{ fontSize:10, fontWeight:400, opacity:.35 }}>/10</span>
                    </div>
                    <div style={{ fontSize:10, opacity:.4 }}>{u.count} derman</div>
                  </div>
                </div>
              ))}
            </>)}

            <div style={{ border:`2px dashed ${dark?"#333":"#ddd"}`, padding:"24px 20px", marginTop:20,
              textAlign:"center", color:muted, fontSize:13, lineHeight:2.2 }}>
              <div style={{ fontSize:20, marginBottom:8 }}>✦</div>
              Dermanın dert sahibinden <strong style={{color:fg}}>10 puan</strong> alırsa<br/>
              <strong style={{color:fg}}>Altın Derman</strong> rozeti ve{" "}
              <strong style={{color:fg}}>{user?.gender==="female"?"Dert Anası":"Dert Babası"}</strong> unvanını kazanırsın
              {!user && (
                <div style={{ marginTop:16 }}>
                  <button onClick={()=>needAuth("register")} style={{ background:"#111", color:"#fff",
                    border:"2px solid #111", padding:"10px 24px",
                    fontFamily:"'Georgia',serif", fontSize:11, fontWeight:700,
                    cursor:"pointer", letterSpacing:1.5, textTransform:"uppercase",
                    boxShadow:"3px 3px 0 #555" }}>Hemen Katıl →</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── İSTATİSTİKLER ── */}
        {tab==="stats" && (
          <div style={{ paddingTop:22 }}>
            <div style={{ paddingBottom:18, marginBottom:20, borderBottom:"2px solid #111" }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:4,
                textTransform:"uppercase", color:"#888", marginBottom:5 }}>Anlık Veriler</div>
              <div style={{ fontSize:26, fontWeight:900, letterSpacing:"-1px" }}>Topluluk İstatistikleri</div>
            </div>

            {/* Ana metrik kartları */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {[
                { label:"Toplam Dert",    value:stats.total,         icon:"😔", desc:"paylaşılan" },
                { label:"Dermana Ulaştı", value:stats.solved,        icon:"⭐", desc:"çözüldü" },
                { label:"Derman Bekleniyor", value:stats.waiting,    icon:"⏳", desc:"henüz yanıt yok" },
                { label:"Ortalama Derman",value:stats.avgDerman,     icon:"💬", desc:"dert başına" },
              ].map(({label,value,icon,desc})=>(
                <div key={label} style={{ background:"#fff", border:"2px solid #111",
                  padding:"18px 16px", boxShadow:"3px 3px 0 #111" }}>
                  <div style={{ fontSize:22 }}>{icon}</div>
                  <div style={{ fontSize:28, fontWeight:900, letterSpacing:"-1px",
                    marginTop:8, lineHeight:1 }}>{value}</div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5,
                    textTransform:"uppercase", color:"#666", marginTop:6 }}>{label}</div>
                  <div style={{ fontSize:10, color:"#888", marginTop:2 }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* Kapatılan dertler */}
            {stats.closed > 0 && (
              <div style={{ background:"#f5f5f5", border:"1.5px solid #ddd",
                padding:"14px 18px", marginBottom:10, display:"flex",
                alignItems:"center", gap:12 }}>
                <span style={{ fontSize:20 }}>🔒</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:14 }}>{stats.closed} dert kapatıldı</div>
                  <div style={{ fontSize:11, color:"#666", marginTop:2 }}>
                    Sahipleri "Derdim Geçti" dedi — derman gelmese de iyileştiler
                  </div>
                </div>
              </div>
            )}

            {/* En çok dert açılan kategori */}
            {stats.topCat && (
              <div style={{ background:"#111", color:"#fff", border:"2px solid #111",
                padding:"18px 20px", marginBottom:10, boxShadow:"4px 4px 0 #555" }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:3,
                  textTransform:"uppercase", opacity:.4, marginBottom:8 }}>
                  En Çok Dert Açılan Kategori
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:28 }}>{CAT_ICONS[stats.topCat[0]]}</span>
                  <div>
                    <div style={{ fontSize:20, fontWeight:900 }}>{stats.topCat[0]}</div>
                    <div style={{ fontSize:12, opacity:.4, marginTop:2 }}>
                      {stats.topCat[1]} dert · toplam dertin %{Math.round(stats.topCat[1]/stats.total*100)}'i
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Kategori dağılımı */}
            <div style={{ background:"#fff", border:"2px solid #111",
              padding:"18px 20px", marginBottom:10 }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:3,
                textTransform:"uppercase", color:"#888", marginBottom:14 }}>
                Kategori Dağılımı
              </div>
              {CATS.slice(1).map(c => {
                const count = stats.catCounts[c]||0;
                const pct   = stats.total ? Math.round(count/stats.total*100) : 0;
                return (
                  <div key={c} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between",
                      marginBottom:5, alignItems:"center" }}>
                      <span style={{ fontSize:12, fontWeight:700, display:"flex",
                        alignItems:"center", gap:6 }}>
                        <span>{CAT_ICONS[c]}</span>{c}
                      </span>
                      <span style={{ fontSize:11, color:"#666" }}>{count} dert · %{pct}</span>
                    </div>
                    <div style={{ height:6, background:"#f0f0f0", border:"1px solid #eee" }}>
                      <div style={{ height:"100%", background:"#111",
                        width:`${pct}%`, transition:"width .6s ease" }}/>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* En çok ortak olunan dert */}
            {stats.mostRelated && (
              <div style={{ border:"2px solid #111", padding:"16px 20px",
                background:"#fff", marginBottom:10 }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:3,
                  textTransform:"uppercase", color:"#888", marginBottom:10 }}>
                  🤝 En Çok Ortak Olunan Dert
                </div>
                <div style={{ fontWeight:800, fontSize:14, marginBottom:4 }}>
                  {stats.mostRelated.title}
                </div>
                <div style={{ fontSize:12, color:"#666" }}>
                  {stats.maxRelate} kişi "Benimkine benziyor" dedi
                </div>
              </div>
            )}

            {/* Toplam derman */}
            <div style={{ border:"2px dashed #ddd", padding:"22px 20px",
              textAlign:"center", color:"#666", marginTop:10 }}>
              <div style={{ fontSize:32, fontWeight:900, color:"#111", letterSpacing:"-1px" }}>
                {stats.totalComs}
              </div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:2,
                textTransform:"uppercase", marginTop:4 }}>
                toplam derman yazıldı
              </div>
              <div style={{ fontSize:11, color:"#888", marginTop:6 }}>
                Her biri bir insanın yüküne omuz vermek için 💙
              </div>
            </div>
          </div>
        )}

      </div>

      {auth && <AuthModal mode={auth} onClose={()=>setAuth(null)} onAuth={handleAuth}/>}
    </div>
  );
}
