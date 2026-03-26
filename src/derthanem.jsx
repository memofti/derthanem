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
  time:       d.created_at,
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
      author:     c.is_anon ? "Anonim" : (c.profiles?.name || "?"),
      avatar:     c.is_anon ? "?" : (c.profiles?.name?.[0]?.toUpperCase() || "?"),
      gender:     c.profiles?.gender || null,
      isAnon:     c.is_anon || false,
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
const CAT_ICONS = { "Hepsi":"✦", "İş":"💼", "Aile":"🏠", "Aşk":"❤️", "Arkadaşlık":"🤝", "Sağlık":"🌿", "Para":"💰" };

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
    if (c.isAnon) return; // anonim dermanlar liderboard'a girmesin
    if (!map[c.authorId]) map[c.authorId] = {
      authorId:c.authorId, name:c.author, avatar:c.avatar,
      total:0, count:0, gold:0, silver:0,
      gender: c.gender // derman yazanın cinsiyeti
    };
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
      background: inv
        ? "linear-gradient(135deg,#fff 0%,#f0f0f0 100%)"
        : "linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)",
      border: inv ? "2px solid #e0e0e0" : "2px solid #333",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:Math.floor(size*0.38), fontWeight:800,
      color: inv?"#111":"#fff",
      boxShadow: inv
        ? "0 2px 8px rgba(0,0,0,.08),inset 0 1px 0 rgba(255,255,255,.9)"
        : "0 4px 14px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.1)",
      fontFamily:"'Inter',system-ui,sans-serif", userSelect:"none" }}>{char}</div>
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

function StarPicker({ onChange, dark=false }) {
  const [hov, setHov] = useState(0);
  const [sel, setSel] = useState(0);

  const handleClick = (n) => {
    const msg = n === 10
      ? "10 puan veriyorsunuz.\n\nBu dert Dermana Ulaşmış sayılacak ve artık yeni derman yazılamayacak.\n\nOnaylıyor musunuz?"
      : n + " puan vermek istediğinize emin misiniz?";
    if (!window.confirm(msg)) return;
    setSel(n);
    onChange(n);
  };

  const getColor = (n) => {
    const active = hov > 0 ? hov : sel;
    if (n > active) return { bg:dark?"#2a2a2a":"#f5f5f5", fg:dark?"#555":"#aaa", bdr:dark?"#333":"#ddd", shadow:"none" };
    if (n <= 3)  return { bg:"linear-gradient(160deg,#fff7e0 0%,#fff3cd 100%)", fg:"#856404", bdr:"#ffc107", shadow:"0 2px 6px rgba(255,193,7,.3)" };
    if (n <= 6)  return { bg:"linear-gradient(160deg,#e8f7f9 0%,#d1ecf1 100%)", fg:"#0c5460", bdr:"#17a2b8", shadow:"0 2px 6px rgba(23,162,184,.3)" };
    if (n <= 9)  return { bg:"linear-gradient(160deg,#e8f5e9 0%,#d4edda 100%)", fg:"#155724", bdr:"#28a745", shadow:"0 2px 6px rgba(40,167,69,.3)" };
    return { bg:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)", fg:"#fff", bdr:"transparent", shadow:"0 4px 12px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.15)" };
  };

  return (
    <div>
      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:6 }}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => {
          const { bg, fg, bdr } = getColor(n);
          return (
            <button key={n}
              onMouseEnter={()=>setHov(n)}
              onMouseLeave={()=>setHov(0)}
              onTouchStart={()=>setHov(n)}
              onClick={()=>handleClick(n)}
              style={{
                width:36, height:36, border:`1.5px solid ${bdr}`,
                background:bg, color:fg,
                cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
                fontSize:13, fontWeight:900,
                borderRadius:8,
                boxShadow: shadow,
                transition:"all .15s cubic-bezier(.22,1,.36,1)",
                transform: hov===n ? "scale(1.2) translateY(-2px)" : "scale(1)",
                flexShrink:0,
              }}>{n}</button>
          );
        })}
      </div>
      <div style={{ fontSize:11, color:"#555", fontWeight:700, minHeight:16 }}>
        {hov===10 ? "⚠ 10 puan — Dert Dermana Ulaşır, yeni derman yazılamaz"
         : hov>0   ? hov + " puan ver"
         : sel>0   ? "✓ " + sel + " puan verildi"
         : "Puan vermek için bir sayıya bas"}
      </div>
    </div>
  );
}

/* ─── Auth Modal ──────────────────────────────────────────── */
function AuthModal({ mode, onClose, onAuth, onVerifyEmail }) {
  const [tab, setTab] = useState(mode);
  const [f, setF] = useState({ name:"", email:"", password:"", gender:"female" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const iS = { width:"100%", padding:"11px 13px", marginBottom:12, boxSizing:"border-box",
    border:"2px solid #ddd", fontFamily:"'Inter',system-ui,sans-serif", fontSize:14,
    background:"#fff", color:"#111", outline:"none" };
  const lS = { fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase",
    marginBottom:5, color:"#666", display:"block" };

  const handleReset = async () => {
    if (!f.email.trim()) { setErr("E-posta adresi girin."); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(f.email.trim(), {
      redirectTo: "https://derthanem.vercel.app",
    });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setResetSent(true);
  };

  const handleSubmit = async () => {
    setErr(""); setLoading(true);
    if (!f.email.trim() || !f.password.trim()) { setErr("E-posta ve şifre zorunlu."); setLoading(false); return; }

    if (tab === "register") {
      if (!f.name.trim()) { setErr("Ad Soyad zorunlu."); setLoading(false); return; }
      const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password });
      if (error) { setErr(error.message); setLoading(false); return; }
      const { error: pe } = await supabase.from("profiles").insert({ id: data.user.id, name: f.name.trim(), gender: f.gender });
      if (pe) { setErr(pe.message); setLoading(false); return; }
      // Email doğrulama gerekiyorsa mesaj göster
      if (data.user && !data.user.confirmed_at) {
        setLoading(false);
        setErr(""); 
        // AuthModal'ı kapat, email doğrulama mesajı göster
        onVerifyEmail(f.email.trim());
        return;
      }
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
      background:"rgba(0,0,0,.6)", backdropFilter:"blur(8px)",
      WebkitBackdropFilter:"blur(8px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", width:"100%", maxWidth:400,
        padding:"0", borderRadius:20, overflow:"hidden",
        boxShadow:"0 24px 64px rgba(0,0,0,.2), 0 4px 16px rgba(0,0,0,.1)" }}>
        <div style={{ display:"flex" }}>
          {[["login","Giriş Yap"],["register","Üye Ol"]].map(([t,l]) => (
            <button key={t} onClick={() => { setTab(t); setErr(""); }} style={{ flex:1, padding:"16px", border:"none",
              background: tab===t
                ? "linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)"
                : "#f5f5f5",
              color:tab===t?"#fff":"#888",
              borderRight: t==="login" ? "1px solid rgba(0,0,0,.1)" : "none" }}>{l}</button>
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
                <button key={g} onClick={() => setF(p=>({...p,gender:g}))} style={{ flex:1, padding:"10px",
                  border: f.gender===g ? "none" : "1.5px solid #e0e0e0",
                  borderRadius:10,
                  background: f.gender===g
                    ? "linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)"
                    : "#f9f9f9",
                  color: f.gender===g ? "#fff" : "#666",
                  boxShadow: f.gender===g ? "0 2px 8px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.08)" : "none",
                  cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700,
                  transition:"all .2s" }}>
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
            border:"2px solid #111", fontFamily:"'Inter',system-ui,sans-serif", fontSize:14, fontWeight:700,
            cursor: loading?"not-allowed":"pointer", letterSpacing:1, marginBottom:8, boxShadow:"4px 4px 0 #555" }}>
            {loading ? "Bekleniyor..." : tab==="login" ? "Giriş Yap →" : "Hesap Oluştur →"}
          </button>
          <button onClick={onClose} style={{ width:"100%", padding:"10px", background:"#fff",
            color:"#666", border:"2px solid #eee", fontFamily:"'Inter',system-ui,sans-serif",
            fontSize:13, cursor:"pointer" }}>Vazgeç</button>

          {/* Şifremi unuttum */}
          {tab==="login" && !showReset && (
            <div style={{ textAlign:"center", marginTop:8 }}>
              <span onClick={()=>setShowReset(true)}
                style={{ fontSize:11, color:"#888", cursor:"pointer", textDecoration:"underline" }}>
                Şifremi unuttum
              </span>
            </div>
          )}
          {showReset && !resetSent && (
            <div style={{ marginTop:10, padding:"12px", background:"#f9f9f9", border:"1.5px solid #eee" }}>
              <div style={{ fontSize:11, color:"#666", marginBottom:8 }}>
                E-posta adresini gir, şifre sıfırlama bağlantısı gönderelim:
              </div>
              <button onClick={handleReset} disabled={loading}
                style={{ width:"100%", padding:"10px", background:"#111", color:"#fff",
                  border:"none", cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
                  fontSize:12, fontWeight:700 }}>
                {loading ? "Gönderiliyor..." : "Sıfırlama Bağlantısı Gönder"}
              </button>
            </div>
          )}
          {resetSent && (
            <div style={{ marginTop:10, padding:"12px", background:"#f0faf0",
              border:"1.5px solid #27ae60", textAlign:"center" }}>
              <div style={{ fontSize:13 }}>✅ Gönderildi!</div>
              <div style={{ fontSize:11, color:"#666", marginTop:4 }}>
                E-posta kutunu kontrol et
              </div>
            </div>
          )}

          <div style={{ textAlign:"center", marginTop:12, fontSize:11, color:"#777" }}>
            {tab==="login" ? (
              <>Hesabın yok mu?{" "}
                <span onClick={()=>{setTab("register");setErr("");setShowReset(false);}}
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

/* ─── Şifre Sıfırlama Ekranı ──────────────────────────────── */
function ResetPasswordScreen({ onDone }) {
  const [pw, setPw]       = useState("");
  const [pw2, setPw2]     = useState("");
  const [err, setErr]     = useState("");
  const [ok, setOk]       = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (pw.length < 6) { setErr("Şifre en az 6 karakter olmalı."); return; }
    if (pw !== pw2)    { setErr("Şifreler eşleşmiyor."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setOk(true);
    setTimeout(onDone, 2000);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f7f7f5",
      fontFamily:"'Inter',system-ui,sans-serif",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#fff", border:"2px solid #111", padding:"36px 32px",
        maxWidth:400, width:"100%", boxShadow:"6px 6px 0 #111" }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:4, textTransform:"uppercase",
          color:"#aaa", marginBottom:8 }}>Derthanem</div>
        <div style={{ fontSize:22, fontWeight:900, marginBottom:24,
          fontFamily:"'Playfair Display',Georgia,serif" }}>Yeni Şifre Belirle</div>

        {ok ? (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
            <div style={{ fontWeight:700, fontSize:16 }}>Şifren güncellendi!</div>
            <div style={{ color:"#888", fontSize:12, marginTop:8 }}>
              Giriş sayfasına yönlendiriliyorsun...
            </div>
          </div>
        ) : (<>
          {err && (
            <div style={{ background:"#fff3f3", border:"2px solid #c0392b",
              padding:"10px 12px", marginBottom:12, fontSize:12,
              color:"#c0392b", fontWeight:700 }}>⚠ {err}</div>
          )}
          <label style={{ fontSize:10, fontWeight:700, letterSpacing:2,
            textTransform:"uppercase", color:"#666", display:"block", marginBottom:5 }}>
            Yeni Şifre
          </label>
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)}
            placeholder="En az 6 karakter"
            style={{ width:"100%", padding:"11px 13px", marginBottom:12,
              boxSizing:"border-box", border:"2px solid #ddd",
              fontFamily:"'Inter',system-ui,sans-serif", fontSize:14, outline:"none" }}/>
          <label style={{ fontSize:10, fontWeight:700, letterSpacing:2,
            textTransform:"uppercase", color:"#666", display:"block", marginBottom:5 }}>
            Şifre Tekrar
          </label>
          <input type="password" value={pw2} onChange={e=>setPw2(e.target.value)}
            placeholder="Aynı şifreyi tekrar gir"
            style={{ width:"100%", padding:"11px 13px", marginBottom:20,
              boxSizing:"border-box", border:"2px solid #ddd",
              fontFamily:"'Inter',system-ui,sans-serif", fontSize:14, outline:"none" }}/>
          <button onClick={handleSave} disabled={loading}
            style={{ width:"100%", padding:"13px", background:"#111", color:"#fff",
              border:"2px solid #111", fontFamily:"'Inter',system-ui,sans-serif",
              fontSize:14, fontWeight:700, cursor:"pointer", boxShadow:"4px 4px 0 #555" }}>
            {loading ? "Kaydediliyor..." : "Şifremi Güncelle →"}
          </button>
        </>)}
      </div>
    </div>
  );
}

/* ─── Onboarding Turu ─────────────────────────────────────── */
function Onboarding({ onClose, fg, bg0, bdr }) {
  const [step, setStep] = useState(0);
  const steps = [
    { icon:"😔", title:"Dertini Dök", body:"Aklında ne varsa yaz. İş, aile, aşk, sağlık... Her dert bir yük, burada paylaşabilirsin. İstersen anonim paylaş." },
    { icon:"💬", title:"Derman Al", body:"Topluluğun diğer üyeleri dertine derman yazar. Gerçek insanlar, samimi tavsiyeler." },
    { icon:"⭐", title:"Puanla ve Ödüllendir", body:"Dermanlar arasında en iyi olanı seç, 1-10 arası puanla. 10 puan verirsen dert 'Dermana Ulaştı' sayılır!" },
    { icon:"🏆", title:"Dert Ustası Ol", body:"Verilen puanlar toplandı, ortalaman yükseldi mi? Liderboard'da Dert Babası veya Dert Anası unvanını kazan." },
  ];
  const s = steps[step];
  return (
    <div style={{ position:"fixed", inset:0, zIndex:5000, background:"rgba(0,0,0,.7)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:bg0, border:`1px solid ${bdr}`, maxWidth:400, width:"100%",
        borderRadius:16, overflow:"hidden",
        boxShadow:"0 24px 64px rgba(0,0,0,.2)", fontFamily:"'Inter',system-ui,sans-serif",
        animation:"fadeScale .3s cubic-bezier(.22,1,.36,1) both" }}>

        {/* Üst çubuk */}
        <div style={{ display:"flex", borderBottom:`2px solid ${bdr}` }}>
          {steps.map((_,i) => (
            <div key={i} style={{ flex:1, height:3,
              background: i <= step ? "#111" : "#eee",
              transition:"background .3s" }}/>
          ))}
        </div>

        <div style={{ padding:"32px 28px 24px" }}>
          <div style={{ fontSize:48, textAlign:"center", marginBottom:16 }}>{s.icon}</div>
          <div style={{ fontSize:20, fontWeight:800, color:fg, marginBottom:12,
            fontFamily:"'Playfair Display',Georgia,serif", textAlign:"center" }}>
            {s.title}
          </div>
          <div style={{ fontSize:14, color:fg, opacity:.7, lineHeight:1.7,
            textAlign:"center", marginBottom:28 }}>
            {s.body}
          </div>

          <div style={{ display:"flex", gap:8 }}>
            {step > 0 && (
              <button onClick={()=>setStep(s=>s-1)}
                style={{ flex:1, padding:"12px", background:"transparent", color:fg,
                  border:`2px solid ${bdr}`, cursor:"pointer",
                  fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700 }}>
                ← Geri
              </button>
            )}
            {step < steps.length-1 ? (
              <button onClick={()=>setStep(s=>s+1)}
                style={{ flex:2, padding:"12px", background:"#111", color:"#fff",
                  border:"2px solid #111", cursor:"pointer",
                  fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700 }}>
                Devam →
              </button>
            ) : (
              <button onClick={onClose}
                style={{ flex:2, padding:"12px", background:"#111", color:"#fff",
                  border:"2px solid #111", cursor:"pointer",
                  fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700 }}>
                Hadi Başlayalım! 🚀
              </button>
            )}
          </div>

          <div style={{ textAlign:"center", marginTop:12 }}>
            <span onClick={onClose} style={{ fontSize:11, color:"#aaa",
              cursor:"pointer", textDecoration:"underline" }}>Geç</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Landing ─────────────────────────────────────────────── */
function Landing({ onDert, onDerman }) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Inter:wght@400;500;600&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes lineGrow { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        .lw {
          position:fixed; inset:0;
          display:flex; flex-direction:column;
          font-family:'Inter',system-ui,sans-serif; overflow:hidden;
        }
        .lh {
          flex:1; display:flex; flex-direction:column;
          align-items:center; justify-content:center;
          cursor:pointer; position:relative; overflow:hidden;
          transition:flex .6s cubic-bezier(.77,0,.18,1);
        }
        .lh-t {
          border-bottom:1.5px solid rgba(17,17,17,.12);
          background:#fafaf8; color:#111;
        }
        .lh-b { background:#111; color:#fff; }
        .li {
          text-align:center; padding:0 40px; user-select:none;
          animation:fadeUp .9s cubic-bezier(.22,1,.36,1) both;
        }
        .lh-b .li { animation-delay:.1s; }
        .l-eyebrow {
          font-size:9px; letter-spacing:5px; text-transform:uppercase;
          margin-bottom:20px; opacity:.35; font-weight:600;
          animation:fadeIn 1.2s ease both; animation-delay:.3s;
        }
        .l-title {
          font-family:'Playfair Display',Georgia,serif;
          font-size:clamp(52px,11vw,100px);
          font-weight:900; line-height:.88;
          letter-spacing:-3px; margin:0;
        }
        .l-sub {
          font-size:13px; opacity:.4; margin:20px 0 28px;
          font-weight:500; letter-spacing:.3px;
          animation:fadeIn 1s ease both; animation-delay:.4s;
        }
        .lbtn {
          font-family:'Inter',system-ui; font-size:11px; font-weight:700;
          letter-spacing:2.5px; text-transform:uppercase;
          padding:14px 40px; border:1.5px solid; cursor:pointer;
          transition:transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s ease, opacity .2s;
          animation:fadeIn 1s ease both; animation-delay:.5s;
        }
        .lbtn-dark  { background:linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%); color:#fff; border-color:transparent; box-shadow:0 4px 14px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.1); }
        .lbtn-light { background:transparent; color:#fff; border-color:rgba(255,255,255,.6); }
        .l-deco {
          position:absolute; font-size:9px; letter-spacing:4px;
          text-transform:uppercase; opacity:.08; font-weight:700;
          pointer-events:none;
        }
        .l-stat {
          position:absolute; bottom:20px; right:24px;
          font-size:9px; letter-spacing:2px; text-transform:uppercase;
          opacity:.18; font-weight:600; font-family:'Inter',system-ui;
        }
        @media(hover:hover) {
          .lw:has(.lh-t:hover) .lh-t { flex:1.65 !important; }
          .lw:has(.lh-t:hover) .lh-b { flex:0.35 !important; }
          .lw:has(.lh-b:hover) .lh-b { flex:1.65 !important; }
          .lw:has(.lh-b:hover) .lh-t { flex:0.35 !important; }
          .lbtn:hover { transform:translate(-2px,-2px); box-shadow:4px 4px 0 currentColor; opacity:.9; }
        }
      `}</style>
      <div className="lw">
        {/* TOP – açık */}
        <div className="lh lh-t" onClick={onDert}>
          <div className="li">
            <div className="l-eyebrow">derthanem · içini dök</div>
            <h1 className="l-title">Dert<br/>Anlat</h1>
            <p className="l-sub">Yüreğindeki yükü paylaş, yalnız değilsin</p>
            <button className="lbtn lbtn-dark">Üye Ol / Giriş Yap</button>
          </div>
          {/* Örnek dertler */}
          <div style={{position:"absolute",bottom:0,left:0,right:0,
            background:"rgba(0,0,0,.04)",borderTop:"1px solid rgba(0,0,0,.06)",
            padding:"10px 16px",display:"flex",gap:16,overflowX:"auto",
            scrollbarWidth:"none",pointerEvents:"none"}}>
            {[
              "İşte patronumla aramız açıldı, ne yapacağımı bilmiyorum",
              "Uzun süredir sevdiğim kişiye duygularımı söyleyemiyorum",
              "Ailemle her konuşmamız kavgayla bitiyor",
              "Arkadaşım sırtımdan konuşmuş, inanmak istemiyorum",
            ].map((t,i)=>(
              <div key={i} style={{flexShrink:0,maxWidth:200,
                fontSize:10,color:"rgba(0,0,0,.4)",lineHeight:1.5,
                fontStyle:"italic",animationDelay:i*0.1+"s"}}>
                "{t}"
              </div>
            ))}
          </div>
          <div className="l-deco" style={{top:24,left:28}}>✦</div>
        </div>

        {/* BOTTOM – koyu */}
        <div className="lh lh-b" onClick={onDerman}>
          <div className="li">
            <div className="l-eyebrow" style={{color:"rgba(255,255,255,.35)"}}>bir umut ol · derman yaz</div>
            <h1 className="l-title" style={{color:"#fff",fontStyle:"italic"}}>Derman<br/>Ol</h1>
            <p className="l-sub" style={{color:"rgba(255,255,255,.4)"}}>Çözüm öner, puan kazan, fark yarat</p>
            <button className="lbtn lbtn-light">Dertleri Gözat →</button>
          </div>
          <div className="l-stat">derthanem.app</div>
        </div>
      </div>
    </>
  );
}

function DertCard({ dert, i=0, user, openId, setOpenId,
                    cTexts, setCTexts, cWarns, setCWarns, cAnon, setCAnon,
                    onRate, onComment, onEdit, onEditDert, onRelate, onClose, onDelete,
                    onDeleteComment, onBlock, onLike, onReport, onThank, onNeedAuth, isNew=false, dark=false, userAvatar=null }) {
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
    const url = `${window.location.origin}${window.location.pathname}#dert-${dert.id}`;
    const text = `"${dert.title}" — ${url}`;
    if (navigator.share) {
      navigator.share({ title: dert.title, text: dert.content.slice(0,100), url }).catch(()=>{});
    } else {
      navigator.clipboard?.writeText(url).catch(()=>{});
    }
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
      border: dert.solved ? "2px solid #f39c12" : `1.5px solid ${cardBdr}`,
      borderRadius: 12,
      marginBottom:16,
      boxShadow: dert.solved
        ? "0 4px 20px rgba(243,156,18,.2), 6px 6px 0 #f39c12"
        : isClosed
        ? "0 2px 8px rgba(0,0,0,.06)"
        : "0 2px 12px rgba(0,0,0,.07)",
      opacity: isClosed ? .75 : 1,
      transition:"box-shadow .2s, transform .2s",
      position:"relative", overflow:"hidden" }}>

      {/* Dermana Ulaştı — üst şerit */}
      {dert.solved && (
        <div style={{
          background:"linear-gradient(135deg,#f39c12 0%,#e67e22 50%,#d35400 100%)",
          color:"#fff", padding:"11px 20px",
          display:"flex", alignItems:"center", justifyContent:"center", gap:10,
          borderBottom:"1px solid rgba(0,0,0,.15)",
          boxShadow:"inset 0 1px 0 rgba(255,255,255,.2)" }}>
          <span style={{ fontSize:18 }}>⭐</span>
          <div style={{ fontSize:11, fontWeight:900, letterSpacing:3,
            textTransform:"uppercase", textShadow:"0 1px 2px rgba(0,0,0,.2)" }}>
            Bu Dert Dermana Ulaştı!
          </div>
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
          ({ "İş":"#2980b9", "Aile":"#8e44ad", "Aşk":"#e74c3c",
             "Arkadaşlık":"#27ae60", "Sağlık":"#16a085", "Para":"#d35400" }[dert.category] || "#111"),
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
                  style={{ width:"100%", padding:"8px 10px", fontFamily:"'Inter',system-ui,sans-serif",
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
                  style={{ width:"100%", padding:"8px 10px", fontFamily:"'Inter',system-ui,sans-serif",
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
                  fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700 }}>Kaydet</button>
                <button onClick={()=>setEditingDert(false)}
                  style={{ padding:"6px 14px", background:"#fff", color:"#888",
                    border:"2px solid #ddd", cursor:"pointer",
                    fontFamily:"'Inter',system-ui,sans-serif", fontSize:11 }}>Vazgeç</button>
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
                cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
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
                color:"#666", cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
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
              padding:"5px 11px", border:"1.5px solid #ffcccc", background:cardBg,
              color:"#c0392b", cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
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
              padding:"5px 11px", border:`1.5px solid ${subBdr}`, background:cardBg,
              color:mutedCard, cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
              fontSize:11, fontWeight:700, marginLeft:"auto"
            }}>🔒 Derdim Geçti</button>
          )}

          {/* Şikayet — dert sahibi olmayan */}
          {!owned && user && !dert.solved && !isClosed && (
            <button onClick={()=>handleReport(null)}
              style={{ padding:"5px 11px", border:"1.5px solid #ddd", background:"#fff",
                color: reported?"#c0392b":"#ddd", cursor:"pointer",
                fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700,
                transition:"color .2s" }}>
              {reported ? "✓ Bildirildi" : "🚩"}
            </button>
          )}

          {/* Kullanıcıyı engelle */}
          {!owned && user && (
            <button onClick={()=>{
              if (window.confirm(dert.author + " adlı kullanıcıyı engellemek istiyor musun? Dertleri artık görünmez."))
                onBlock(dert.authorId);
            }} style={{ padding:"5px 11px", border:`1.5px solid ${subBdr}`, background:cardBg,
              color:mutedCard, cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
              fontSize:11, fontWeight:700 }} title="Kullanıcıyı Engelle">
              🚫
            </button>
          )}

          {/* Paylaş */}
          <button onClick={handleShare} style={{
            display:"flex", alignItems:"center", gap:4,
            padding:"5px 11px", border:"1.5px solid #ddd", background:"#fff",
            color: copied ? "#27ae60" : "#aaa", cursor:"pointer",
            fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700,
            marginLeft: owned ? 0 : "auto",
            transition:"color .2s"
          }}>
            {copied ? "✓ Kopyalandı" : "🔗 Paylaş"}
          </button>
        </div>

          {/* ── DERMAN BÖLÜMÜ ── */}
        <div style={{ marginTop:0 }}>

          {/* Derman toggle başlık */}
          <div onClick={()=>dert.comments.length>0 && setOpenId(isOpen?null:dert.id)}
            style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"10px 20px", paddingLeft:22,
              background: dark ? "#1a1a1a" : "#f8f8f8",
              borderTop: `2px solid ${dark?"#2a2a2a":"#ebebeb"}`,
              cursor: dert.comments.length>0 ? "pointer" : "default",
              userSelect:"none",
            }}>

            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:12, fontWeight:800, letterSpacing:1,
                textTransform:"uppercase", color: dert.comments.length>0 ? fgCard : mutedCard }}>
                💬 {dert.comments.length === 0 ? "Henüz derman yok" : dert.comments.length+" Derman"}
              </span>
              {dert.comments.length>0 && (
                <span style={{ fontSize:11, color:mutedCard, fontWeight:600 }}>
                  {isOpen ? "▲ gizle" : "▼ göster"}
                </span>
              )}
            </div>

            {owned && !dert.solved && !isClosed && dert.comments.length>0 && (
              <span style={{ fontSize:10, color:"#c0392b", fontWeight:700,
                letterSpacing:.5, animation:"pulse 2s infinite",
                background:"#fff3f3", padding:"3px 8px", border:"1px solid #ffcccc" }}>
                ⭐ Puanla
              </span>
            )}
          </div>

          {/* Dermanlar listesi */}
          {isOpen && dert.comments.length>0 && (
            <div style={{ background: dark?"#161616":"#f4f4f4",
              borderTop:`1px solid ${dark?"#2a2a2a":"#e8e8e8"}` }}>
              {[...dert.comments]
                .sort((a,b) => (b.likedBy||[]).length - (a.likedBy||[]).length)
                .map((c, ci) => {
                const isBest      = c.ownerRated && c.stars===10;
                const isMyComment = user && user.id === c.authorId;
                const canEdit     = isMyComment && !c.ownerRated && !isClosed;
                const isEditing   = editingId === c.id;                return (
                  <div key={c.id} style={{
                    background: isBest
                      ? "linear-gradient(160deg,#2d2d2d 0%,#111 50%,#080808 100%)"
                      : cardBg,
                    color: isBest ? "#fff" : fgCard,
                    borderBottom: `1px solid ${dark?"#2a2a2a":"#ebebeb"}`,
                    borderLeft: isBest ? "4px solid #f39c12" : `4px solid ${dark?"#333":"#e0e0e0"}`,
                    borderRadius: "0 8px 8px 0",
                    padding:"14px 16px 14px 18px",
                    marginBottom: 6,
                    boxShadow: isBest ? "0 2px 12px rgba(243,156,18,.15)" : "none",
                  }}>
                    {/* Derman yazar satırı */}
                    <div style={{ display:"flex", alignItems:"center", gap:8,
                      flexWrap:"wrap", marginBottom:10 }}>
                      <Av char={(user && c.authorId===user.id && userAvatar) ? userAvatar : c.avatar}
                        inv={!isBest} size={28}/>
                      <div>
                        <span style={{ fontSize:13, fontWeight:700 }}>{c.author}</span>
                        {c.isAnon && <span style={{ fontSize:9, color:mutedCard,
                          marginLeft:6, fontWeight:600 }}>anonim</span>}
                      </div>
                      {c.badge && <Badge type={c.badge}/>}
                      {canEdit && !isEditing && (
                        <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                          <button onClick={()=>startEdit(c)} style={{
                            background:"none", border:`1px solid ${isBest?"rgba(255,255,255,.25)":"#ddd"}`,
                            cursor:"pointer", padding:"2px 8px", fontSize:10, fontWeight:700,
                            color: isBest?"rgba(255,255,255,.5)":"#999",
                            fontFamily:"'Inter',system-ui,sans-serif" }}>Düzenle</button>
                          <button onClick={()=>{
                            if (window.confirm("Bu dermanı silmek istiyor musun?"))
                              onDeleteComment(dert.id, c.id);
                          }} style={{
                            background:"none", border:"1px solid #ffcccc",
                            cursor:"pointer", padding:"2px 8px", fontSize:10, fontWeight:700,
                            color:"#c0392b", fontFamily:"'Inter',system-ui,sans-serif" }}>Sil</button>
                        </div>
                      )}
                    </div>

                    {/* Derman metni */}
                    {isEditing ? (
                      <div>
                        <textarea value={editText} onChange={e=>setEditText(e.target.value)} rows={3}
                          style={{ width:"100%", padding:"9px 11px", boxSizing:"border-box",
                            border:`2px solid ${cardBdr}`, fontFamily:"'Inter',system-ui,sans-serif",
                            fontSize:13, lineHeight:1.7, resize:"vertical",
                            background:cardBg, color:fgCard, outline:"none", marginBottom:8 }}
                          autoFocus/>
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={saveEdit} style={{ padding:"6px 14px",
                            background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)", color:"#fff", border:"1px solid #1a1a1a",
                            cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
                            fontSize:11, fontWeight:700 }}>Kaydet</button>
                          <button onClick={()=>setEditingId(null)} style={{ padding:"6px 14px",
                            background:cardBg, color:mutedCard, border:`1.5px solid ${subBdr}`,
                            cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
                            fontSize:11 }}>İptal</button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize:14, lineHeight:1.75, margin:"0 0 12px 0",
                        color: isBest?"rgba(255,255,255,.9)":fgCard, wordBreak:"break-word" }}>
                        {c.text}
                      </p>
                    )}

                    {/* Alt aksiyonlar */}
                    {!isEditing && (
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        {/* Beğeni */}
                        {user && (
                          <button onClick={()=>onLike(dert.id, c.id)}
                            style={{ display:"flex", alignItems:"center", gap:4,
                              padding:"3px 9px", border:"1.5px solid",
                              borderColor:(c.likedBy||[]).includes(user.id)?"#111":"#e0e0e0",
                              background:(c.likedBy||[]).includes(user.id)?"#111":"transparent",
                              color:(c.likedBy||[]).includes(user.id)?"#fff":mutedCard,
                              cursor:"pointer", fontSize:11, fontWeight:700,
                              transition:"all .15s" }}>
                            👍 {(c.likedBy||[]).length>0 && (c.likedBy||[]).length}
                          </button>
                        )}
                        {/* Teşekkür */}
                        {owned && c.authorId !== user?.id && (
                          <button onClick={()=>onThank&&onThank(dert.id, c.id, c.authorId)}
                            style={{ padding:"3px 9px", border:"1.5px solid #d4edda",
                              background:"transparent", color:"#27ae60",
                              cursor:"pointer", fontSize:10, fontWeight:700 }}>
                            🙏 Teşekkür
                          </button>
                        )}
                        {/* Şikayet */}
                        {user && !isMyComment && (
                          <button onClick={()=>onReport(dert.id, c.id)}
                            style={{ padding:"3px 8px", border:"1.5px solid #e0e0e0",
                              background:"transparent", color:"#ddd",
                              cursor:"pointer", fontSize:10, transition:"color .2s" }}>
                            🚩
                          </button>
                        )}
                        {/* Puan */}
                        {c.ownerRated && (
                          <div style={{ marginLeft:"auto" }}>
                            <ScoreBar value={c.stars} inv={isBest}/>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Puanlama alanı */}
                    {owned && !dert.solved && !c.ownerRated && !isClosed && !isEditing && (
                      <div style={{ marginTop:12, padding:"12px 14px",
                        background: dark?"#1e1e1e":"#fff",
                        border:`1.5px solid ${dark?"#333":"#e8e8e8"}`,
                        borderRadius:2 }}>
                        <div style={{ fontSize:9, fontWeight:800, letterSpacing:2,
                          textTransform:"uppercase", color:mutedCard, marginBottom:8 }}>
                          Bu dermanı puanla (1–10)
                        </div>
                        <StarPicker onChange={stars=>onRate(dert.id,c.id,stars)} dark={dark}/>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Derman yaz kutusu — comments listesinin sonunda */}
              {!owned && !isClosed && !dert.solved && user && (
                <div style={{ padding:"16px", background:cardBg,
                  borderTop:`2px dashed ${dark?"#2a2a2a":"#e8e8e8"}`,
                  borderRadius:"0 0 12px 12px" }}>
                  <div style={{ fontSize:9, fontWeight:800, letterSpacing:2,
                    textTransform:"uppercase", color:mutedCard, marginBottom:10 }}>
                    ✦ Dermanını Yaz
                  </div>
                  <div style={{ position:"relative" }}>
                    <textarea ref={taRef}
                      value={cTexts[dert.id]||""}
                      onClick={e=>e.stopPropagation()}
                      onChange={e=>{
                        const v=e.target.value.slice(0,500);
                        setCTexts(p=>({...p,[dert.id]:v}));
                        setCWarns(p=>({...p,[dert.id]:warnMsg(v)}));
                      }}
                      onFocus={()=>setTimeout(()=>taRef.current?.scrollIntoView({behavior:"smooth",block:"center"}),300)}
                      placeholder="Çözüm öner, deneyimini paylaş…"
                      rows={3}
                      style={{ width:"100%", padding:"11px 13px", boxSizing:"border-box",
                        border:`2px solid ${subBdr}`, fontFamily:"'Inter',system-ui,sans-serif",
                        fontSize:14, lineHeight:1.7, resize:"vertical",
                        background:cardBg, color:fgCard, outline:"none" }}/>
                    <div style={{ position:"absolute", bottom:8, right:10,
                      fontSize:10, color:(cTexts[dert.id]||"").length>450?"#c0392b":mutedCard,
                      pointerEvents:"none" }}>
                      {(cTexts[dert.id]||"").length}/500
                    </div>
                  </div>
                  {cWarns[dert.id] && (
                    <div style={{ fontSize:11, color:"#c0392b", marginTop:4, fontWeight:700 }}>
                      {cWarns[dert.id]}
                    </div>
                  )}
                  <div style={{ display:"flex", alignItems:"center",
                    justifyContent:"space-between", marginTop:10 }}>
                    <label style={{ display:"flex", alignItems:"center", gap:6,
                      cursor:"pointer", fontSize:12, color:mutedCard, userSelect:"none" }}>
                      <input type="checkbox"
                        checked={!!(cAnon&&cAnon[dert.id])}
                        onChange={e=>setCAnon&&setCAnon(p=>({...p,[dert.id]:e.target.checked}))}
                        style={{ width:14, height:14, cursor:"pointer" }}/>
                      Anonim yaz
                    </label>
                    <button onClick={(e)=>{ e.stopPropagation(); onComment(dert.id); }}
                      style={{ padding:"9px 22px",
                        background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)",
                        color:"#fff", border:"none", borderRadius:8, cursor:"pointer",
                        fontFamily:"'Inter',system-ui,sans-serif",
                        fontSize:13, fontWeight:700, letterSpacing:.3,
                        boxShadow:"0 2px 8px rgba(0,0,0,.25)" }}>
                      Derman Yaz →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Derman yaz — hiç derman yokken (isOpen ama comments.length===0) */}
          {isOpen && dert.comments.length===0 && !owned && !isClosed && !dert.solved && user && (
            <div style={{ background: dark?"#161616":"#f4f4f4",
              borderTop:`1px solid ${dark?"#2a2a2a":"#e8e8e8"}` }}>
              <div style={{ padding:"16px", background:cardBg }}>
                <div style={{ fontSize:9, fontWeight:800, letterSpacing:2,
                  textTransform:"uppercase", color:mutedCard, marginBottom:10 }}>
                  ✦ İlk Dermanı Sen Yaz
                </div>
                <div style={{ position:"relative" }}>
                  <textarea ref={taRef}
                    value={cTexts[dert.id]||""}
                    onClick={e=>e.stopPropagation()}
                    onChange={e=>{
                      const v=e.target.value.slice(0,500);
                      setCTexts(p=>({...p,[dert.id]:v}));
                      setCWarns(p=>({...p,[dert.id]:warnMsg(v)}));
                    }}
                    onFocus={()=>setTimeout(()=>taRef.current?.scrollIntoView({behavior:"smooth",block:"center"}),300)}
                    placeholder="Çözüm öner, deneyimini paylaş…"
                    rows={3}
                    style={{ width:"100%", padding:"11px 13px", boxSizing:"border-box",
                      border:`2px solid ${subBdr}`, fontFamily:"'Inter',system-ui,sans-serif",
                      fontSize:14, lineHeight:1.7, resize:"vertical",
                      background:cardBg, color:fgCard, outline:"none" }}/>
                  <div style={{ position:"absolute", bottom:8, right:10,
                    fontSize:10, color:(cTexts[dert.id]||"").length>450?"#c0392b":mutedCard,
                    pointerEvents:"none" }}>
                    {(cTexts[dert.id]||"").length}/500
                  </div>
                </div>
                {cWarns[dert.id] && (
                  <div style={{ fontSize:11, color:"#c0392b", marginTop:4, fontWeight:700 }}>
                    {cWarns[dert.id]}
                  </div>
                )}
                <div style={{ display:"flex", alignItems:"center",
                  justifyContent:"space-between", marginTop:10 }}>
                  <label style={{ display:"flex", alignItems:"center", gap:6,
                    cursor:"pointer", fontSize:12, color:mutedCard, userSelect:"none" }}>
                    <input type="checkbox"
                      checked={!!(cAnon&&cAnon[dert.id])}
                      onChange={e=>setCAnon&&setCAnon(p=>({...p,[dert.id]:e.target.checked}))}
                      style={{ width:14, height:14, cursor:"pointer" }}/>
                    Anonim yaz
                  </label>
                  <button onClick={(e)=>{ e.stopPropagation(); onComment(dert.id); }}
                    style={{ padding:"9px 22px",
                      background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)",
                      color:"#fff", border:"none", borderRadius:8, cursor:"pointer",
                      fontFamily:"'Inter',system-ui,sans-serif",
                      fontSize:13, fontWeight:700, letterSpacing:.3,
                      boxShadow:"0 2px 8px rgba(0,0,0,.25)" }}>
                    Derman Yaz →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Kapalı/Çözülmüş mesajı */}
          {(dert.solved || isClosed) && (
            <div style={{ padding:"10px 20px",
              background: dark?"#1a1a1a":"#f8f8f8",
              borderTop:`1px solid ${dark?"#2a2a2a":"#ebebeb"}`,
              fontSize:12, color:mutedCard, fontStyle:"italic", textAlign:"center" }}>
              {dert.solved
                ? "⭐ Bu dert dermana ulaştı — derman yazılamaz"
                : "🔒 Bu dert kapatıldı — yeni derman yazılamaz"}
            </div>
          )}

          {/* Giriş yapmamış kullanıcı */}
          {!owned && !isClosed && !dert.solved && !user && (
            <div style={{ padding:"14px 20px",
              background: dark?"#1a1a1a":"#f8f8f8",
              borderTop:`1px solid ${dark?"#2a2a2a":"#ebebeb"}`,
              textAlign:"center", fontSize:12, color:mutedCard }}>
              <span onClick={()=>onNeedAuth("login")}
                style={{ color:fgCard, fontWeight:700, cursor:"pointer",
                  textDecoration:"underline" }}>Giriş yap</span>
              {" "}veya{" "}
              <span onClick={()=>onNeedAuth("register")}
                style={{ color:fgCard, fontWeight:700, cursor:"pointer",
                  textDecoration:"underline" }}>üye ol</span>
              {" "}— derman yaz
            </div>
          )}

          {/* Derman yaz butonu — kapalı haldeyken */}
          {!owned && !isClosed && !dert.solved && user && !isOpen && (
            <div style={{ padding:"10px 20px",
              background: dark?"#1a1a1a":"#f8f8f8",
              borderTop:`1px solid ${dark?"#2a2a2a":"#ebebeb"}` }}>
              <button onClick={()=>setOpenId(dert.id)}
                style={{ width:"100%", padding:"10px", background:"transparent",
                  color:fgCard, border:`1.5px dashed ${subBdr}`,
                  cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
                  fontSize:12, fontWeight:600 }}>
                + Derman yaz
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Kategori uzmanlık unvanları ─────────────────────────── */
const CAT_TITLES = {
  "İş":         ["İş Yeri Danışmanı","Kariyer Koçu","İş Hayatı Ustası"],
  "Aile":       ["Aile Dostu","Aile Danışmanı","Aile Bilgesi"],
  "Aşk":        ["Kalp Rehberi","Aşk Danışmanı","Aşk Ustası"],
  "Arkadaşlık": ["Dost Eli","Arkadaşlık Rehberi","Dostluk Bilgesi"],
  "Sağlık":     ["Can Dostu","Sağlık Danışmanı","Sağlık Bilgesi"],
  "Para":       ["Bütçe Dostu","Para Danışmanı","Finans Uzmanı"],
};
function CSS() {
  return (
    <style>{[
      /* Google Fonts */
      "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inter:wght@400;500;600;700&display=swap');",
      /* CSS Variables */
      ":root{--g-dark:linear-gradient(160deg,#2a2a2a 0%,#111 50%,#0a0a0a 100%);--g-dark-hover:linear-gradient(160deg,#333 0%,#1a1a1a 50%,#0f0f0f 100%);--g-dark-soft:linear-gradient(135deg,#222 0%,#111 100%);--shadow-dark:0 4px 12px rgba(0,0,0,.4),0 1px 3px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08);--shadow-dark-hover:0 8px 24px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.1);}",
      /* Keyframes */
      "@keyframes fu{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes fuUp{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes slideDown{from{opacity:0;max-height:0}to{opacity:1;max-height:2000px}}",
      "@keyframes sd{from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}",
      "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}",
      "@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}",
      "@keyframes stampIn{from{opacity:0;transform:rotate(-6deg) scale(1.4)}to{opacity:1;transform:rotate(-6deg) scale(1)}}",
      "@keyframes newCard{0%{opacity:0;transform:translateY(-24px) scale(.96)}60%{transform:translateY(4px) scale(1.01)}100%{opacity:1;transform:translateY(0) scale(1)}}",
      "@keyframes fadeScale{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}",
      "@keyframes gradientShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}",
      /* Base font */
      "*{box-sizing:border-box;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}",
      "body{font-family:'Inter',system-ui,sans-serif;}",
      ".dh{font-family:'Playfair Display',Georgia,serif;font-weight:900;}",
      /* Cards */
      ".dc{animation:fu .35s cubic-bezier(.22,1,.36,1) both}",
      ".stamp{animation:stampIn .45s cubic-bezier(.175,.885,.32,1.275) both}",
      ".dert-card{transition:transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s ease;}",
      ".dert-new{animation:newCard .55s cubic-bezier(.175,.885,.32,1.275) both;}",
      /* Hover */
      "@media(hover:hover){.dert-card:hover{transform:translateY(-2px);box-shadow:0 16px 40px rgba(0,0,0,.13)!important}}",
      "@media(hover:hover){.cat-btn:hover{transform:translateY(-1px);opacity:.85}}",
      /* 3D Dark Buttons */
      ".btn-dark{background:var(--g-dark)!important;box-shadow:var(--shadow-dark)!important;border:none!important;transition:all .18s cubic-bezier(.22,1,.36,1)!important;}",
      "@media(hover:hover){.btn-dark:hover{background:var(--g-dark-hover)!important;box-shadow:var(--shadow-dark-hover)!important;transform:translateY(-1px)!important;}}",
      ".btn-dark:active{transform:translateY(1px)!important;box-shadow:0 2px 6px rgba(0,0,0,.4)!important;}",
      /* Avatar 3D */
      ".av-dark{background:var(--g-dark)!important;box-shadow:var(--shadow-dark),inset 0 1px 0 rgba(255,255,255,.12)!important;}",
      /* Shimmer */
      ".btn-shine{position:relative;overflow:hidden;}",
      ".btn-shine::after{content:'';position:absolute;inset:0;background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.12) 50%,transparent 60%);background-size:200% 100%;animation:shimmer 3s infinite;}",
      /* Solved card animated border */
      ".solved-card{background-size:200% 200%!important;animation:gradientShift 4s ease infinite!important;}",
      /* Dark mode smooth transition */
      "*, *::before, *::after { transition: background-color .25s ease, border-color .2s ease, color .15s ease !important }",
      ".no-transition, .no-transition * { transition: none !important }",
      /* Scrollbar */
      "::-webkit-scrollbar{width:4px;height:4px}",
      "::-webkit-scrollbar-track{background:transparent}",
      "::-webkit-scrollbar-thumb{background:#ddd;border-radius:4px}",
      "::-webkit-scrollbar-thumb:hover{background:#bbb}",
      "@media(max-width:600px){.dert-card{margin-bottom:12px}.cat-btn{font-size:10px!important;padding:5px 10px!important}}",
      ".modal-enter{animation:fadeScale .25s cubic-bezier(.22,1,.36,1) both}",
    ].join("\n")}</style>
  );
}

/* ─── Toast ────────────────────────────────────────────────── */
function Toast({ toast }) {
  const base = { position:"fixed", top:24, left:"50%", transform:"translateX(-50%)",
    zIndex:9999, fontFamily:"'Inter',system-ui,sans-serif", textAlign:"center",
    animation:"sd .4s ease", whiteSpace:"nowrap", borderRadius:12 };
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
  if (toast === "blocked") return (
    <div style={{ ...base, background:"#333", color:"#fff", padding:"12px 28px", boxShadow:"4px 4px 0 #111" }}>
      <div style={{ fontSize:13, fontWeight:700 }}>🚫 Kullanıcı engellendi</div>
      <div style={{ fontSize:10, opacity:.6, marginTop:3 }}>Bu kullanıcının dertleri artık görünmeyecek</div>
    </div>
  );
  if (toast?.startsWith("thanks_")) return (
    <div style={{ ...base, background:"#27ae60", color:"#fff", padding:"12px 28px", boxShadow:"4px 4px 0 #1a7a45" }}>
      <div style={{ fontSize:13, fontWeight:700 }}>🙏 Teşekkürün iletildi!</div>
    </div>
  );
  if (toast === "feedback") return (
    <div style={{ ...base, background:"#27ae60", color:"#fff", padding:"12px 28px", boxShadow:"4px 4px 0 #1a7a45" }}>
      <div style={{ fontSize:13, fontWeight:700 }}>✓ Geri bildirim iletildi</div>
      <div style={{ fontSize:10, opacity:.7, marginTop:3 }}>Teşekkürler! En kısa sürede değerlendireceğiz.</div>
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
  const [page,   setPage]     = useState(1);
  const PAGE_SIZE = 20;
  const [loading,setLoading]  = useState(true);
  const [tab,    setTab]      = useState("feed");
  const [cat,    setCat]      = useState("Hepsi");
  const [openId, setOpenId]   = useState(null);
  const [toast,  setToast]    = useState(null);
  const [dark,   setDark]     = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [seenNotifs, setSeenNotifs] = useState(new Set());
  const [welcomeMsg, setWelcomeMsg] = useState(null);
  const [search,  setSearch]   = useState("");
  const [sortBy,  setSortBy]   = useState("new");
  const [blockedUsers, setBlockedUsers] = useState([]); // engellenen user id'leri

  const [userAvatar, setUserAvatar] = useState(null);  // seçili emoji avatar
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [adminReports, setAdminReports] = useState([]);
  const [adminTab, setAdminTab]         = useState("sikayet");
  const [adminSearch, setAdminSearch]   = useState("");
  const [pwaPrompt, setPwaPrompt]       = useState(null); // PWA install prompt
  const [showPwa, setShowPwa]           = useState(false); // sikayet | dertler | dermanlar
  const [boardTab, setBoardTab]         = useState("all");
  const [showOnboard, setShowOnboard]   = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackType, setFeedbackType] = useState("öneri");
  const [verifyEmail, setVerifyEmail]   = useState(null);
  const [showChangePw, setShowChangePw] = useState(false);
  const [changePw1, setChangePw1]       = useState("");
  const [changePw2, setChangePw2]       = useState("");
  const [changePwErr, setChangePwErr]   = useState("");
  const [changePwOk, setChangePwOk]     = useState(false);
  const [profileTab, setProfileTab]     = useState("dertlerim"); // dertlerim | bildirimler | ayarlar
  const [notifs, setNotifs]             = useState([]);
  const [notifsLoading, setNotifsLoading] = useState(false); // email doğrulama bekliyor // onboarding turu

  const isAdmin = user?.email === ADMIN_EMAIL || user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const [showPost, setShowPost] = useState(false);
  const [postForm, setPostForm] = useState({ title:"", content:"", category:"İş", isAnon:false });
  const [postWarn, setPostWarn] = useState("");
  const [draft,   setDraft]    = useState(null);
  const [cTexts,  setCTexts]   = useState({});
  const [cWarns,  setCWarns]   = useState({});
  const [cAnon,   setCAnon]    = useState({}); // dertId → bool (anonim derman)

  /* ── Supabase: Tüm dertleri çek ── */
  const loadDerts = useCallback(async () => {
    const { data, error } = await supabase
      .from("derts")
      .select([
        "id,author_id,is_anon,title,content,category,solved,closed,created_at",
        "profiles!derts_author_id_fkey(name,gender)",
        "relates(user_id)",
        "comments(id,author_id,text,stars,owner_rated,badge,is_anon,created_at,profiles!comments_author_id_fkey(name,gender),likes(user_id))"
      ].join(","))
      .order("created_at", { ascending: false });
    if (!error && data) setDerts(data.map(mapDert));
    setLoading(false);
  }, []);

  /* ── Oturum kontrolü + veri yükleme ── */
  useEffect(() => {
    loadDerts();

    // URL'de şifre sıfırlama veya email doğrulama token'ı var mı kontrol et
    const hash = window.location.hash;
    const search = window.location.search;
    const isRecovery = hash.includes("type=recovery") || search.includes("type=recovery");
    const isSignup   = hash.includes("type=signup")   || search.includes("type=signup");

    // Hash routing: #dert-123 formatında direkt dert linki
    const dertMatch = hash.match(/^#dert-(\d+)$/);
    if (dertMatch) {
      const dertId = parseInt(dertMatch[1]);
      setScreen("app"); setTab("feed"); setOpenId(dertId);
      setTimeout(()=>{
        const el = document.getElementById("dert-"+dertId);
        if (el) el.scrollIntoView({behavior:"smooth", block:"center"});
      }, 1200);
    }

    if (isRecovery) {
      setScreen("reset_password");
    } else if (isSignup) {
      setScreen("email_verified");
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        // Şifre sıfırlama modunda ise profil yükleme
        if (isRecovery) {
          setScreen("reset_password");
          return;
        }
        const { data: profile } = await supabase
          .from("profiles").select("*").eq("id", session.user.id).single();
        if (profile) {
          setUser({ id: session.user.id, name: profile.name,
            gender: profile.gender, email: session.user.email,
            registeredAt: new Date(profile.created_at).getTime() });
          setScreen("app");
          try {
            const blocked = JSON.parse(localStorage.getItem("derthanem_blocked_"+session.user.id) || "[]");
            setBlockedUsers(blocked);
          } catch(e) {}
        }
      }
    });

    /* Realtime — her değişiklikte yenile */
    const ch = supabase.channel("derthanem_rt", { config: { broadcast: { self: true } } })
      .on("postgres_changes", { event:"*", schema:"public", table:"derts"    }, () => loadDerts())
      .on("postgres_changes", { event:"*", schema:"public", table:"comments" }, () => loadDerts())
      .on("postgres_changes", { event:"*", schema:"public", table:"likes"    }, () => loadDerts())
      .on("postgres_changes", { event:"*", schema:"public", table:"relates"  }, () => loadDerts())
      .subscribe();

    /* Fallback: her 30 saniyede bir yenile */
    const interval = setInterval(loadDerts, 30000);

    // PWA kurulum event'ini yakala
    const handlePwaPrompt = (e) => {
      e.preventDefault();
      setPwaPrompt(e);
      const dismissed = localStorage.getItem("derthanem_pwa_dismissed");
      if (!dismissed) setShowPwa(true);
    };
    window.addEventListener("beforeinstallprompt", handlePwaPrompt);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(interval);
      window.removeEventListener("beforeinstallprompt", handlePwaPrompt);
    };
  }, [loadDerts]);

  const board = useMemo(() => computeBoard(derts), [derts]);

  // Haftalık en çok derman alan dert
  const weeklyHot = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return [...derts]
      .filter(d => !d.solved && !d.closed)
      .map(d => ({
        ...d,
        weeklyComments: d.comments.filter(c => {
          // comment id'den rough timestamp estimate (big int ids are time-based)
          return true; // tüm aktif dertleri say
        }).length
      }))
      .filter(d => d.ts > weekAgo || d.weeklyComments > 0)
      .sort((a,b) => b.weeklyComments - a.weeklyComments)
      .find(d => d.weeklyComments > 0) || null;
  }, [derts]);

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
    try {
      const blocked = JSON.parse(localStorage.getItem("derthanem_blocked_"+u.id) || "[]");
      setBlockedUsers(blocked);
    } catch(e) {}
    // Yeni kullanıcıya onboarding turu göster
    try {
      const seen = localStorage.getItem("derthanem_onboard_"+u.id);
      if (!seen) { setShowOnboard(true); localStorage.setItem("derthanem_onboard_"+u.id, "1"); }
    } catch(e) {}
    await loadDerts();
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

  const loadNotifs = async () => {
    if (!user) return;
    setNotifsLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*, profiles!notifications_from_user_id_fkey(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifs(data || []);
    setNotifsLoading(false);
  };

  const unreadNotifCount = notifs.filter(n=>!n.is_read).length;

  const markAllRead = async () => {
    await supabase.from("notifications")
      .update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("Hesabını silmek istediğine emin misin?\n\nTüm dertlerin ve dermanların silinecek. Bu işlem geri alınamaz.")) return;
    const confirmText = window.prompt("Onaylamak için 'SİL' yaz:");
    if (confirmText !== "SİL") { alert("İptal edildi."); return; }
    // Kullanıcının dertlerini ve dermanlarını sil
    await supabase.from("derts").delete().eq("author_id", user.id);
    await supabase.from("comments").delete().eq("author_id", user.id);
    await supabase.from("profiles").delete().eq("id", user.id);
    await supabase.auth.signOut();
    setUser(null); setScreen("landing"); setDraft(null);
  };

  const handleThankYou = async (dertId, commentId, commentAuthorId) => {
    // Dert sahibi derman yazana teşekkür gönderir (bildirim olarak)
    await supabase.from("reports").insert({
      reporter_id: user.id,
      dert_id: dertId,
      comment_id: commentId,
      reason: "tesekkur:" + commentAuthorId,
    });
    showToast("thanks_"+commentId);
  };
  const needAuth = (m="login") => setAuth(m);

  /* ── Supabase handlers ── */
  const handleRate = async (dertId, commentId, stars) => {
    const badge = stars===10?"gold":stars>=8?"silver":null;
    // Önce UI'ı hemen güncelle (optimistic)
    const updateFn = prev => prev.map(d => {
      if (d.id !== dertId) return d;
      const comments = d.comments.map(c =>
        c.id !== commentId ? c : { ...c, stars, ownerRated:true, badge }
      );
      return { ...d, comments, solved: stars===10 ? true : d.solved };
    });
    setDerts(updateFn);
    if (stars===10) showToast("solved_"+dertId);
    // Sonra DB'ye yaz
    await supabase.from("comments")
      .update({ stars, owner_rated:true, badge }).eq("id", commentId);
    if (stars===10) {
      await supabase.from("derts").update({ solved:true }).eq("id", dertId);
    }
    await refreshDertInFeed(dertId);
  };

  // Tek bir dert'i derts içinde güncelle
  const refreshDertInFeed = useCallback(async (dertId) => {
    const { data } = await supabase
      .from("derts")
      .select([
        "id,author_id,is_anon,title,content,category,solved,closed,created_at",
        "profiles!derts_author_id_fkey(name,gender)",
        "relates(user_id)",
        "comments(id,author_id,text,stars,owner_rated,badge,is_anon,created_at,profiles!comments_author_id_fkey(name,gender),likes(user_id))"
      ].join(","))
      .eq("id", dertId)
      .single();
    if (data) {
      const mapped = mapDert(data);
      setDerts(prev => prev.map(d => d.id===dertId ? mapped : d));
    }
  }, []);

  const handleComment = async (dertId) => {
    if (!user) { needAuth("login"); return; }
    const text = (cTexts[dertId]||"").trim();
    const isAnon = cAnon[dertId] || false;
    if (!text) return;
    if (hasBanned(text)) { setCWarns(p=>({...p,[dertId]:warnMsg(text,user)})); return; }
    if (isNewAccount(user)&&/\d{10,}|@|\bwww\b|\.com/.test(text)) {
      setCWarns(p=>({...p,[dertId]:"⚠ Yeni hesaplar ilk 5 dakika iletişim bilgisi paylaşamaz."})); return;
    }
    if (isDuplicate(user.id,text)) {
      setCWarns(p=>({...p,[dertId]:"⚠ Aynı mesajı tekrar gönderemezsin."})); return;
    }
    setCWarns(p=>({...p,[dertId]:""}));
    const displayName = isAnon ? "Anonim" : user.name;
    const displayAvatar = isAnon ? "?" : (userAvatar||user.name[0].toUpperCase());
    const tempId = Date.now();
    setDerts(prev=>prev.map(d=>d.id!==dertId?d:{
      ...d, comments:[...d.comments,{
        id:tempId, authorId:user.id,
        author:displayName, avatar:displayAvatar,
        text:censorText(text), stars:0, ownerRated:false, badge:null, likedBy:[], isAnon
      }]
    }));
    setCTexts(p=>({...p,[dertId]:""})); setOpenId(dertId);
    const { error } = await supabase.from("comments")
      .insert({ dert_id:dertId, author_id:user.id, text:censorText(text), is_anon:isAnon });
    if (error) {
      setDerts(prev=>prev.map(d=>d.id!==dertId?d:{
        ...d, comments:d.comments.filter(c=>c.id!==tempId)
      }));
    } else {
      // Dert sahibine bildirim gönder (kendi dertine derman yazıyorsa bildirim yok)
      const dert = derts.find(d=>d.id===dertId);
      if (dert && dert.authorId !== user.id && !isAnon) {
        await supabase.from("notifications").insert({
          user_id: dert.authorId,
          type: "new_derman",
          dert_id: dertId,
          from_user_id: user.id,
          message: (user.name + " dertine derman yazdı: \"" + text.slice(0,60) + (text.length>60?"...":"") + "\""),
        });
        // E-posta bildirimi gönder (arka planda, hata olursa sessizce geç)
        supabase.functions.invoke("send-notification-email", {
          body: {
            dert_id: dertId,
            comment_id: Date.now(),
            commenter_name: user.name,
            dert_title: dert.title,
          }
        }).catch(()=>{});
      }
      await refreshDertInFeed(dertId);
    }
  };

  const handleEdit = async (dertId, commentId, newText) => {
    await supabase.from("comments").update({ text:newText }).eq("id", commentId);
    await refreshDertInFeed(dertId);
  };

  const handleEditDert = async (dertId, form) => {
    await supabase.from("derts")
      .update({ title:form.title.trim(), content:form.content.trim() }).eq("id", dertId);
    showToast("edit_dert");
    await refreshDertInFeed(dertId);
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
    await refreshDertInFeed(dertId);
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
    await refreshDertInFeed(dertId);
  };

  const handleClose = async (dertId) => {
    await supabase.from("derts").update({ closed:true }).eq("id", dertId);
    showToast("closed_"+dertId);
    await refreshDertInFeed(dertId);
  };

  const handleDeleteComment = async (dertId, commentId) => {
    // Önce UI'dan kaldır
    const removeComment = prev => prev.map(d => d.id!==dertId ? d : {
      ...d, comments: d.comments.filter(c => c.id!==commentId)
    });
    setDerts(removeComment);
    // DB'den sil
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) {
      await refreshDertInFeed(dertId);
    }
  };

  const handleBlockUser = (blockedId) => {
    if (!user || blockedId === user.id) return;
    const updated = [...new Set([...blockedUsers, blockedId])];
    setBlockedUsers(updated);
    // localStorage'a kaydet
    try { localStorage.setItem("derthanem_blocked_"+user.id, JSON.stringify(updated)); } catch(e) {}
    showToast("blocked");
  };


  const handleFeedback = async () => {
    if (!feedbackText.trim()) return;
    await supabase.from("reports").insert({
      reporter_id: user?.id || null,
      reason: "[GERIBILDIRIMtype:" + feedbackType + "] " + feedbackText.trim(),
    });
    setFeedbackText(""); setShowFeedback(false);
    showToast("feedback");
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
    const tempId = Date.now();
    // Optimistic: hemen UI'a ekle
    const optimistic = {
      id:tempId, authorId:user.id,
      author: postForm.isAnon?"Anonim":user.name,
      avatar: postForm.isAnon?"?":(userAvatar||user.name[0].toUpperCase()),
      gender:user.gender, isAnon:postForm.isAnon,
      title:censorText(postForm.title), content:censorText(postForm.content),
      ts:Date.now(), category:postForm.category,
      solved:false, closed:false, relatableBy:[], comments:[], isNew:true
    };
    setDerts(prev=>[optimistic,...prev]);
    setPostForm({ title:"", content:"", category:"İş", isAnon:false });
    setDraft(null); setShowPost(false); setOpenId(tempId); setTab("feed");
    // DB'ye kaydet
    const { data, error } = await supabase.from("derts").insert({
      author_id: user.id,
      title:     optimistic.title,
      content:   optimistic.content,
      category:  postForm.category,
      is_anon:   postForm.isAnon,
    }).select("id").single();
    if (error) {
      setDerts(prev=>prev.filter(d=>d.id!==tempId));
      setPostWarn("⚠ Bir hata oluştu, tekrar dene."); return;
    }
    // Gerçek ID ile güncelle
    setDerts(prev=>prev.map(d=>d.id===tempId?{...d,id:data.id,isNew:false}:d));
    setOpenId(data.id);
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

  // Rozet sistemi
  const myAchievements = user ? [
    { id:"ilk_dert",   icon:"📝", label:"İlk Dert",      desc:"İlk dertini paylaştın",          earned: myDerts.length >= 1 },
    { id:"ilk_derman", icon:"💬", label:"İlk Derman",    desc:"İlk dermanını yazdın",            earned: myComments.length >= 1 },
    { id:"derman_5",   icon:"✍️", label:"Derman Yazarı", desc:"5 derman yazdın",                 earned: myComments.length >= 5 },
    { id:"derman_20",  icon:"🖊️", label:"Derman Ustası", desc:"20 derman yazdın",                earned: myComments.length >= 20 },
    { id:"altin_1",    icon:"⭐", label:"Altın Kalp",    desc:"İlk altın dermanını aldın",       earned: myGold >= 1 },
    { id:"altin_3",    icon:"🌟", label:"Altın Usta",    desc:"3 altın derman kazandın",         earned: myGold >= 3 },
    { id:"dert_5",     icon:"😔", label:"Dertli",        desc:"5 dert paylaştın",                earned: myDerts.length >= 5 },
    { id:"dert_coz",   icon:"🎉", label:"Derdim Bitti",  desc:"Bir derttin dermana ulaştı",      earned: myDerts.some(d=>d.solved) },
    { id:"avg_8",      icon:"🏆", label:"Puan Şampiyonu","desc":"Ortalamanın 8 üzeri",            earned: myAvg && parseFloat(myAvg) >= 8 },
  ] : [];
  // Liderboard'daki sıra
  const myRank     = user ? board.findIndex(u=>u.authorId===user.id)+1 : 0;
  const myGenderBoard = user ? board.filter(u=>u.gender===user.gender) : [];
  const myGenderRank  = user ? myGenderBoard.findIndex(u=>u.authorId===user.id)+1 : 0;

  const filtered = useMemo(() => {
    let list = cat==="Hepsi" ? [...derts] : derts.filter(d=>d.category===cat);
    if (blockedUsers.length > 0)
      list = list.filter(d => !blockedUsers.includes(d.authorId));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q)
      );
    }
    if (sortBy==="mostDerman") list.sort((a,b)=>b.comments.length-a.comments.length);
    else if (sortBy==="unrated") list = list.filter(d=>!d.solved&&d.comments.length===0);
    return list;
  }, [derts, cat, search, sortBy, blockedUsers]);

  const pagedFiltered = useMemo(() => {
    const paged = filtered.slice(0, page * PAGE_SIZE);
    // openId ile açılan dert sayfada yoksa ekle
    if (openId && !paged.find(d=>d.id===openId)) {
      const found = filtered.find(d=>d.id===openId);
      if (found) return [...paged, found];
      // filtered'da da yoksa derts'ten bak (kategori/arama filtresi dışında olabilir)
      const inAll = derts.find(d=>d.id===openId);
      if (inAll) return [...paged, inAll];
    }
    return paged;
  }, [filtered, page, openId, derts]);

  /* ── Shared header ── */
  const bg0  = dark?"#111":"#fff";
  const bg1  = dark?"#1a1a1a":"#f7f7f5";
  const fg   = dark?"#fff":"#111";
  const bdr  = dark?"#333":"#111";
  const muted= dark?"#aaa":"#666";

  const Header = ({ title, left }) => (
    <div style={{ position:"sticky", top:0, zIndex:200,
      background: dark
        ? "rgba(17,17,17,.92)"
        : "rgba(255,255,255,.88)",
      backdropFilter:"blur(12px)",
      WebkitBackdropFilter:"blur(12px)",
      borderBottom:`1px solid ${dark?"rgba(255,255,255,.08)":"rgba(0,0,0,.08)"}`,
      boxShadow: dark
        ? "0 1px 0 rgba(255,255,255,.04), 0 4px 20px rgba(0,0,0,.3)"
        : "0 1px 0 rgba(0,0,0,.04), 0 4px 20px rgba(0,0,0,.06)",
      display:"flex", alignItems:"center",
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
                    fontFamily:"'Inter',system-ui,sans-serif" }}>
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
                    padding:"6px 12px", cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
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
                fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700,
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
            <div onClick={()=>{ setShowNotifs(false); if (screen!=="profile") { loadNotifs(); } setScreen(screen==="profile"?"app":"profile"); }}
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
              fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700,
              whiteSpace:"nowrap" }}>Giriş</button>
            <button onClick={()=>needAuth("register")} style={{ background:"#111", color:"#fff",
              border:"2px solid #111", padding:"6px 12px", cursor:"pointer",
              fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700,
              boxShadow:"3px 3px 0 #555", whiteSpace:"nowrap" }}>Üye Ol</button>
          </>
        )}
      </div>
    </div>
  );

  /* ══ LANDING ══ */
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", fontFamily:"'Inter',system-ui,sans-serif", flexDirection:"column", gap:16,
      background:"#fff" }}>
      <div style={{ fontSize:22, fontWeight:900, letterSpacing:"-1px" }}>Derthanem</div>
      <div style={{ fontSize:11, letterSpacing:3, textTransform:"uppercase", color:"#777",
        animation:"pulse 1.2s ease infinite" }}>yükleniyor...</div>
      <CSS/>
    </div>
  );

  /* ══ ŞİFRE SIFIRLA ══ */
  if (screen === "reset_password") return (
    <ResetPasswordScreen
      onDone={()=>{ window.location.hash=""; setScreen("landing"); }}
      bg0={bg0} fg={fg} bdr={bdr}
    />
  );

  /* ══ EMAİL DOĞRULANDI ══ */
  if (screen === "email_verified") return (
    <div style={{ minHeight:"100vh", background:"#f7f7f5", fontFamily:"'Inter',system-ui,sans-serif",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <CSS/>
      <div style={{ background:"#fff", border:"2px solid #111", padding:"48px 32px",
        maxWidth:400, width:"100%", boxShadow:"6px 6px 0 #111", textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
        <div style={{ fontSize:22, fontWeight:900, marginBottom:12,
          fontFamily:"'Playfair Display',Georgia,serif" }}>Email Doğrulandı!</div>
        <div style={{ fontSize:14, color:"#666", lineHeight:1.7, marginBottom:28 }}>
          Hesabın aktif. Şimdi giriş yapabilirsin.
        </div>
        <button onClick={()=>{ window.location.hash=""; setScreen("landing"); setAuth("login"); }}
          style={{ background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)", color:"#fff", border:"1px solid #1a1a1a",
            padding:"12px 32px", cursor:"pointer",
            fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700,
            boxShadow:"3px 3px 0 #555" }}>
          Giriş Yap →
        </button>
      </div>
    </div>
  );

  /* ══ EMAİL DOĞRULAMA BEKLİYOR ══ */
  if (verifyEmail) return (
    <div style={{ minHeight:"100vh", background:"#f7f7f5", fontFamily:"'Inter',system-ui,sans-serif",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <CSS/>
      <div style={{ background:"#fff", border:"2px solid #111", padding:"48px 32px",
        maxWidth:400, width:"100%", boxShadow:"6px 6px 0 #111", textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📧</div>
        <div style={{ fontSize:22, fontWeight:900, marginBottom:12,
          fontFamily:"'Playfair Display',Georgia,serif" }}>Email'ini Doğrula</div>
        <div style={{ fontSize:14, color:"#666", lineHeight:1.8, marginBottom:8 }}>
          <strong>{verifyEmail}</strong> adresine doğrulama maili gönderdik.
        </div>
        <div style={{ fontSize:13, color:"#888", lineHeight:1.7, marginBottom:28 }}>
          Maildeki linke tıklayarak hesabını aktifleştir, sonra giriş yapabilirsin.
        </div>
        <button onClick={()=>{ setVerifyEmail(null); setAuth("login"); }}
          style={{ background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)", color:"#fff", border:"1px solid #1a1a1a",
            padding:"12px 32px", cursor:"pointer",
            fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700,
            boxShadow:"3px 3px 0 #555", marginBottom:12, width:"100%" }}>
          Giriş Yap →
        </button>
        <button onClick={()=>setVerifyEmail(null)}
          style={{ background:"transparent", color:"#888", border:"1.5px solid #ddd",
            padding:"10px 32px", cursor:"pointer",
            fontFamily:"'Inter',system-ui,sans-serif", fontSize:12, width:"100%" }}>
          Geri Dön
        </button>
      </div>
    </div>
  );

  if (screen==="landing") return (
    <>
      <CSS/>
      <Toast toast={toast}/>
      <Landing onDert={()=>needAuth("register")} onDerman={()=>setScreen("app")}/>
      {auth && <AuthModal mode={auth} onClose={()=>setAuth(null)} onAuth={handleAuth} onVerifyEmail={(email)=>{setVerifyEmail(email);setAuth(null);}}/>}
    </>
  );

  /* ══ PROFILE ══ */
  /* ══ ADMIN ══ */
  if (screen==="admin" && isAdmin) return (
    <div style={{ minHeight:"100vh", background:bg1, fontFamily:"'Inter',system-ui,sans-serif", color:fg }}>
      <CSS/><Toast toast={toast}/>
      <Header left={
        <button onClick={()=>setScreen("app")} style={{ background:"none", border:"none",
          cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700,
          marginRight:4, padding:"4px 8px" }}>← Geri</button>
      }/>
      <div style={{ maxWidth:860, margin:"0 auto", padding:"28px 16px 60px" }}>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:9, letterSpacing:4, textTransform:"uppercase", color:muted, marginBottom:6 }}>🔐 Yönetim Paneli</div>
          <div style={{ fontSize:26, fontWeight:900, letterSpacing:"-1px", color:fg,
            fontFamily:"'Playfair Display',Georgia,serif" }}>Admin</div>
        </div>

        {/* İstatistik kartları */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:24 }}>
          {[
            ["Toplam Dert", derts.length, "📋"],
            ["Çözülen", derts.filter(d=>d.solved).length, "⭐"],
            ["Toplam Derman", derts.reduce((a,d)=>a+d.comments.length,0), "💬"],
            ["Açık Şikayet", adminReports.length, "🚩"],
          ].map(([label, val, icon])=>(
            <div key={label} style={{ background:bg0, border:`1.5px solid ${bdr}`,
              borderRadius:12, padding:"16px 14px", textAlign:"center",
              boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
              <div style={{ fontSize:22 }}>{icon}</div>
              <div style={{ fontSize:26, fontWeight:900, marginTop:6, color:fg }}>{val}</div>
              <div style={{ fontSize:9, color:muted, letterSpacing:1, textTransform:"uppercase", marginTop:4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tab sistemi */}
        <div style={{ display:"flex", gap:6, background:dark?"#1a1a1a":"#ebebeb",
          padding:4, borderRadius:12, marginBottom:20 }}>
          {[
            ["sikayet", `🚩 Şikayetler (${adminReports.length})`],
            ["dertler", `📋 Tüm Dertler (${derts.length})`],
            ["dermanlar", `💬 Tüm Dermanlar (${derts.reduce((a,d)=>a+d.comments.length,0)})`],
          ].map(([id, label]) => (
            <button key={id} onClick={()=>{ setAdminTab(id); setAdminSearch(""); }}
              style={{ flex:1, padding:"9px 8px", border:"none", borderRadius:9,
                fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700,
                cursor:"pointer", transition:"all .2s",
                color: adminTab===id ? "#fff" : muted,
                background: adminTab===id
                  ? "linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)"
                  : "transparent",
                boxShadow: adminTab===id
                  ? "0 2px 8px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08)"
                  : "none" }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── ŞİKAYETLER ── */}
        {adminTab === "sikayet" && (
          adminReports.length === 0 ? (
            <div style={{ border:`2px dashed ${bdr}`, borderRadius:12,
              padding:"40px 20px", textAlign:"center", color:muted }}>
              <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
              <div style={{ fontSize:14, fontWeight:700 }}>Şikayet yok — her şey temiz!</div>
            </div>
          ) : (
            adminReports.map(r => {
              const relatedDert = derts.find(d => d.id === r.dert_id);
              const relatedComment = relatedDert?.comments?.find(c => c.id === r.comment_id);
              return (
                <div key={r.id} style={{ background:bg0, border:`1.5px solid ${bdr}`,
                  borderRadius:12, padding:"18px 20px", marginBottom:12,
                  boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:10, fontWeight:700, letterSpacing:2,
                        textTransform:"uppercase", color:"#c0392b", marginBottom:8 }}>
                        🚩 {r.reason}
                      </div>
                      <div style={{ fontSize:11, color:muted, marginBottom:8 }}>
                        Şikayet eden: <strong>{r.profiles?.name || "?"}</strong> · {new Date(r.created_at).toLocaleString("tr-TR")}
                      </div>
                      {relatedDert && (
                        <div style={{ background:dark?"#2a2a2a":"#f9f9f9", border:`1.5px solid ${bdr}`,
                          borderRadius:8, padding:"10px 14px", marginBottom:8 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:muted, marginBottom:4 }}>DERT</div>
                          <div style={{ fontSize:13, fontWeight:700, marginBottom:4, color:fg }}>{relatedDert.title}</div>
                          <div style={{ fontSize:12, color:muted }}>{relatedDert.content.slice(0,120)}...</div>
                          <div style={{ fontSize:11, color:muted, marginTop:4 }}>— {relatedDert.author}</div>
                        </div>
                      )}
                      {relatedComment && (
                        <div style={{ background:"#fff3f3", border:"1.5px solid #ffcccc",
                          borderRadius:8, padding:"10px 14px" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#c0392b", marginBottom:4 }}>ŞİKAYET EDİLEN DERMAN</div>
                          <div style={{ fontSize:13, color:"#333" }}>{relatedComment.text}</div>
                          <div style={{ fontSize:11, color:"#aaa", marginTop:4 }}>— {relatedComment.author}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {r.dert_id && (
                        <button onClick={()=>{
                          setScreen("app"); setTab("feed"); setCat("Hepsi"); setOpenId(r.dert_id);
                          setTimeout(()=>{ const el=document.getElementById("dert-"+r.dert_id); if(el) el.scrollIntoView({behavior:"smooth",block:"center"}); },300);
                        }} style={{ padding:"7px 14px",
                          background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)",
                          color:"#fff", border:"none", borderRadius:8, cursor:"pointer",
                          fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700,
                          boxShadow:"0 2px 8px rgba(0,0,0,.25)" }}>
                          Derte Git →
                        </button>
                      )}
                      {r.comment_id && (
                        <button onClick={async()=>{
                          if (!window.confirm("Bu dermanı silmek istiyor musun?")) return;
                          if (relatedComment?.ownerRated && relatedComment?.stars === 10) {
                            await supabase.from("derts").update({ solved: false }).eq("id", r.dert_id);
                          }
                          await supabase.from("comments").delete().eq("id", r.comment_id);
                          await supabase.from("reports").delete().eq("id", r.id);
                          setAdminReports(prev=>prev.filter(x=>x.id!==r.id));
                          await loadDerts(); showToast("deleted");
                        }} style={{ padding:"7px 14px", background:"#c0392b", color:"#fff",
                          border:"none", borderRadius:8, cursor:"pointer",
                          fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700 }}>
                          Dermanı Sil
                        </button>
                      )}
                      {r.dert_id && !r.comment_id && (
                        <button onClick={async()=>{
                          if (!window.confirm("Bu derdi silmek istiyor musun?")) return;
                          await supabase.from("derts").delete().eq("id", r.dert_id);
                          await supabase.from("reports").delete().eq("id", r.id);
                          setAdminReports(prev=>prev.filter(x=>x.id!==r.id));
                          await loadDerts(); showToast("deleted");
                        }} style={{ padding:"7px 14px", background:"#c0392b", color:"#fff",
                          border:"none", borderRadius:8, cursor:"pointer",
                          fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700 }}>
                          Derdi Sil
                        </button>
                      )}
                      <button onClick={async()=>{
                        await supabase.from("reports").delete().eq("id", r.id);
                        setAdminReports(prev=>prev.filter(x=>x.id!==r.id));
                      }} style={{ padding:"7px 14px", background:bg0, color:muted,
                        border:`1px solid ${bdr}`, borderRadius:8, cursor:"pointer",
                        fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700 }}>
                        Yoksay
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )
        )}

        {/* ── TÜM DERTLER ── */}
        {adminTab === "dertler" && (
          <div>
            {/* Arama */}
            <div style={{ position:"relative", marginBottom:16 }}>
              <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)",
                fontSize:14, opacity:.4, pointerEvents:"none" }}>🔍</span>
              <input value={adminSearch} onChange={e=>setAdminSearch(e.target.value)}
                placeholder="Dert başlığı, içerik veya yazar ara..."
                style={{ width:"100%", padding:"11px 13px 11px 38px", boxSizing:"border-box",
                  border:`1.5px solid ${bdr}`, borderRadius:10, fontSize:13,
                  background:bg0, color:fg, outline:"none",
                  fontFamily:"'Inter',system-ui,sans-serif" }}/>
              {adminSearch && (
                <button onClick={()=>setAdminSearch("")}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                    background:"none", border:"none", cursor:"pointer", fontSize:16, color:muted }}>✕</button>
              )}
            </div>
            {(() => {
              const q = adminSearch.toLowerCase();
              const filtered = [...derts]
                .sort((a,b)=>b.ts-a.ts)
                .filter(d => !q ||
                  d.title.toLowerCase().includes(q) ||
                  d.content.toLowerCase().includes(q) ||
                  d.author.toLowerCase().includes(q) ||
                  d.category.toLowerCase().includes(q)
                );
              return (<>
                <div style={{ fontSize:11, color:muted, marginBottom:12 }}>
                  {filtered.length} sonuç{adminSearch ? ` — "${adminSearch}"` : ""}
                </div>
                {filtered.map(d => (
                  <div key={d.id} style={{ background:bg0, border:`1.5px solid ${bdr}`,
                    borderRadius:12, padding:"14px 18px", marginBottom:10,
                    display:"flex", gap:12, alignItems:"flex-start",
                    boxShadow:"0 2px 6px rgba(0,0,0,.04)" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                        <span style={{ fontSize:9, fontWeight:700, letterSpacing:1.5,
                          textTransform:"uppercase",
                          background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)",
                          color:"#fff", padding:"2px 8px", borderRadius:4 }}>{d.category}</span>
                        {d.solved && <span style={{ fontSize:9, background:"#fff3cd",
                          color:"#856404", padding:"2px 8px", borderRadius:4, fontWeight:700 }}>⭐ Çözüldü</span>}
                        {d.closed && !d.solved && <span style={{ fontSize:9, background:dark?"#333":"#f5f5f5",
                          color:muted, padding:"2px 8px", borderRadius:4, fontWeight:700 }}>🔒 Kapalı</span>}
                        <span style={{ fontSize:10, color:muted, marginLeft:"auto" }}>#{d.id}</span>
                      </div>
                      <div style={{ fontWeight:700, fontSize:14, marginBottom:2, color:fg }}>{d.title}</div>
                      <div style={{ fontSize:12, color:muted, marginBottom:4 }}>
                        {d.content.slice(0,80)}{d.content.length>80?"...":""}
                      </div>
                      <div style={{ fontSize:10, color:muted }}>
                        👤 {d.author} · 💬 {d.comments.length} derman · {new Date(d.ts).toLocaleString("tr-TR")}
                      </div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                      <button onClick={()=>{ setScreen("app"); setTab("feed"); setCat("Hepsi"); setOpenId(d.id); }}
                        style={{ padding:"5px 12px", background:dark?"#2a2a2a":"#f5f5f5", color:fg,
                          border:`1px solid ${bdr}`, borderRadius:6, cursor:"pointer",
                          fontFamily:"'Inter',system-ui,sans-serif", fontSize:10, fontWeight:700 }}>
                        Görüntüle
                      </button>
                      {d.solved && (
                        <button onClick={async()=>{
                          if (!window.confirm("Dermana Ulaştı durumunu sıfırlayalım mı?")) return;
                          await supabase.from("derts").update({ solved: false }).eq("id", d.id);
                          const goldComment = d.comments.find(c=>c.stars===10&&c.ownerRated);
                          if (goldComment) await supabase.from("comments").update({ stars:0, owner_rated:false, badge:null }).eq("id", goldComment.id);
                          await loadDerts(); showToast("edit_dert");
                        }} style={{ padding:"5px 12px", background:"#fff3cd", color:"#856404",
                          border:"1px solid #ffc107", borderRadius:6, cursor:"pointer",
                          fontFamily:"'Inter',system-ui,sans-serif", fontSize:10, fontWeight:700 }}>
                          ⭐ Sıfırla
                        </button>
                      )}
                      <button onClick={async()=>{
                        if (!window.confirm(`"${d.title}" silinsin mi?`)) return;
                        await supabase.from("derts").delete().eq("id", d.id);
                        await loadDerts(); showToast("deleted");
                      }} style={{ padding:"5px 12px", background:"#fff0f0", color:"#c0392b",
                        border:"1px solid #ffcccc", borderRadius:6, cursor:"pointer",
                        fontFamily:"'Inter',system-ui,sans-serif", fontSize:10, fontWeight:700 }}>
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </>);
            })()}
          </div>
        )}

        {/* ── TÜM DERMANLAR ── */}
        {adminTab === "dermanlar" && (
          <div>
            {/* Arama */}
            <div style={{ position:"relative", marginBottom:16 }}>
              <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)",
                fontSize:14, opacity:.4, pointerEvents:"none" }}>🔍</span>
              <input value={adminSearch} onChange={e=>setAdminSearch(e.target.value)}
                placeholder="Derman metni veya yazar ara..."
                style={{ width:"100%", padding:"11px 13px 11px 38px", boxSizing:"border-box",
                  border:`1.5px solid ${bdr}`, borderRadius:10, fontSize:13,
                  background:bg0, color:fg, outline:"none",
                  fontFamily:"'Inter',system-ui,sans-serif" }}/>
              {adminSearch && (
                <button onClick={()=>setAdminSearch("")}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                    background:"none", border:"none", cursor:"pointer", fontSize:16, color:muted }}>✕</button>
              )}
            </div>
            {(() => {
              const q = adminSearch.toLowerCase();
              const allComments = derts.flatMap(d=>d.comments.map(c=>({...c,dertTitle:d.title,dertId:d.id})))
                .sort((a,b)=>b.id-a.id)
                .filter(c => !q ||
                  c.text.toLowerCase().includes(q) ||
                  c.author.toLowerCase().includes(q) ||
                  c.dertTitle?.toLowerCase().includes(q)
                );
              return (<>
                <div style={{ fontSize:11, color:muted, marginBottom:12 }}>
                  {allComments.length} sonuç{adminSearch ? ` — "${adminSearch}"` : ""}
                </div>
                {allComments.map(c => (
                  <div key={c.id} style={{ background:bg0, border:`1.5px solid ${bdr}`,
                    borderRadius:12, padding:"14px 18px", marginBottom:10,
                    display:"flex", gap:12, alignItems:"flex-start",
                    boxShadow:"0 2px 6px rgba(0,0,0,.04)" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:9, color:muted, fontWeight:700, letterSpacing:1,
                        textTransform:"uppercase", marginBottom:4 }}>
                        "{c.dertTitle?.slice(0,60)}"
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                        <span style={{ fontWeight:700, fontSize:13, color:fg }}>{c.author}</span>
                        {c.isAnon && <span style={{ fontSize:9, color:muted, fontWeight:600 }}>anonim</span>}
                        {c.badge === "gold" && <span style={{ fontSize:9, background:"#fff3cd",
                          color:"#856404", padding:"2px 8px", borderRadius:4, fontWeight:700 }}>⭐ ALTIN</span>}
                        {c.badge === "silver" && <span style={{ fontSize:9, background:dark?"#333":"#f5f5f5",
                          color:muted, padding:"2px 8px", borderRadius:4, fontWeight:700 }}>✦ GÜMÜŞ</span>}
                        {c.ownerRated && <span style={{ fontSize:10, color:"#27ae60", fontWeight:700 }}>{c.stars}/10</span>}
                      </div>
                      <div style={{ fontSize:13, color:fg, lineHeight:1.5 }}>
                        {c.text.slice(0,150)}{c.text.length>150?"...":""}
                      </div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                      <button onClick={()=>{ setScreen("app"); setTab("feed"); setCat("Hepsi"); setOpenId(c.dertId); }}
                        style={{ padding:"5px 12px", background:dark?"#2a2a2a":"#f5f5f5", color:fg,
                          border:`1px solid ${bdr}`, borderRadius:6, cursor:"pointer",
                          fontFamily:"'Inter',system-ui,sans-serif", fontSize:10, fontWeight:700 }}>
                        Derte Git
                      </button>
                      <button onClick={async()=>{
                        if (!window.confirm("Bu dermanı silmek istiyor musun?")) return;
                        if (c.ownerRated && c.stars === 10) {
                          await supabase.from("derts").update({ solved: false }).eq("id", c.dertId);
                        }
                        await supabase.from("comments").delete().eq("id", c.id);
                        await loadDerts(); showToast("deleted");
                      }} style={{ padding:"5px 12px", background:"#fff0f0", color:"#c0392b",
                        border:"1px solid #ffcccc", borderRadius:6, cursor:"pointer",
                        fontFamily:"'Inter',system-ui,sans-serif", fontSize:10, fontWeight:700 }}>
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </>);
            })()}
          </div>
        )}

      </div>
    </div>
  );
  if (screen==="profile" && user) return (
    <div style={{ minHeight:"100vh", background:bg1, fontFamily:"'Inter',system-ui,sans-serif", color:fg }}>
      <CSS/><Toast toast={toast}/>
      <Header left={
        <button onClick={()=>setScreen("app")} style={{ background:"none", border:"none",
          cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700,
          marginRight:4, padding:"4px 8px", display:"flex", alignItems:"center", gap:4 }}>← Geri</button>
      }/>

      <div style={{ maxWidth:700, margin:"0 auto", padding:"24px 16px 60px" }}>

        {/* Profile hero */}
        <div style={{
          background: dark
            ? "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)"
            : "linear-gradient(135deg, #111 0%, #333 100%)",
          color:"#fff", borderRadius:16,
          padding:"28px 26px", marginBottom:20,
          boxShadow:"0 8px 32px rgba(0,0,0,.2)" }}>
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
            <div style={{ display:"flex", gap:0, flexWrap:"wrap" }}>
              {[
                ["Dert", myDerts.length],
                ["Derman", myComments.length],
                ["Çözülen", myDerts.filter(d=>d.solved).length],
                ["Ort.", myAvg ? `${myAvg}` : "-"],
              ].map(([l,v],i) => (
                <div key={l} style={{ textAlign:"center", padding:"0 16px",
                  borderLeft: i>0?"1px solid rgba(255,255,255,.12)":"none" }}>
                  <div style={{ fontSize:22, fontWeight:900, lineHeight:1 }}>{v}</div>
                  <div style={{ fontSize:9, fontWeight:700, letterSpacing:2,
                    textTransform:"uppercase", opacity:.35, marginTop:4 }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Liderboard sırası */}
            {myRank > 0 && (
              <div style={{ marginTop:16, display:"flex", gap:10, flexWrap:"wrap" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10,
                  background:"rgba(255,255,255,.12)", border:"1.5px solid rgba(255,255,255,.25)",
                  padding:"10px 16px", flex:1, minWidth:120 }}>
                  <span style={{ fontSize:22 }}>🏆</span>
                  <div>
                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:2,
                      textTransform:"uppercase", opacity:.5 }}>Genel Sıra</div>
                    <div style={{ fontSize:20, fontWeight:900, lineHeight:1.1 }}>
                      {myRank}.
                      <span style={{ fontSize:11, opacity:.5, fontWeight:400, marginLeft:4 }}>
                        / {board.length} kişi
                      </span>
                    </div>
                  </div>
                </div>
                {myGenderRank > 0 && (
                  <div style={{ display:"flex", alignItems:"center", gap:10,
                    background:"rgba(255,255,255,.12)", border:"1.5px solid rgba(255,255,255,.25)",
                    padding:"10px 16px", flex:1, minWidth:120 }}>
                    <span style={{ fontSize:22 }}>{user.gender==="female"?"👩":"👨"}</span>
                    <div>
                      <div style={{ fontSize:9, fontWeight:700, letterSpacing:2,
                        textTransform:"uppercase", opacity:.5 }}>
                        {user.gender==="female"?"Dert Anası":"Dert Babası"}
                      </div>
                      <div style={{ fontSize:20, fontWeight:900, lineHeight:1.1 }}>
                        {myGenderRank}.
                        <span style={{ fontSize:11, opacity:.5, fontWeight:400, marginLeft:4 }}>
                          / {myGenderBoard.length} kişi
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {myRank === 0 && myComments.length > 0 && (
              <div style={{ marginTop:12, fontSize:11, opacity:.4, fontStyle:"italic" }}>
                Sıralamaya girmek için dermanın puanlanmalı
              </div>
            )}
          </div>
        </div>

        {/* Profil Tabları */}
        <div style={{ display:"flex", gap:6, marginBottom:24,
          background: dark?"#1a1a1a":"#f0f0f0", padding:4, borderRadius:12 }}>
          {[
            ["dertlerim",   "📋"],
            ["rozetler",    "🏅"],
            ["bildirimler", unreadNotifCount > 0 ? `🔔 ${unreadNotifCount}` : "🔔"],
            ["ayarlar",     "⚙️"],
          ].map(([id, icon]) => (
            <button key={id} onClick={()=>{
              setProfileTab(id);
              if (id==="bildirimler") loadNotifs();
            }} style={{ flex:1, padding:"9px 6px",
              background: profileTab===id
                ? "linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)"
                : "transparent",
              color: profileTab===id ? "#fff" : muted,
              border:"none", borderRadius:9,
              cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
              fontSize:14, transition:"all .2s",
              boxShadow: profileTab===id
                ? "0 2px 8px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08)"
                : "none" }}>
              {icon}
            </button>
          ))}
        </div>

        {/* ── DERTLERİM ── */}
        {profileTab === "dertlerim" && <>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:3, textTransform:"uppercase",
            color:muted, marginBottom:14 }}>Dertlerim ({myDerts.length})</div>

          {myDerts.length===0 ? (
            <div style={{ border:`2px dashed ${bdr}`, padding:"32px", textAlign:"center",
              color:muted, fontSize:13, marginBottom:24 }}>
              Henüz dert paylaşmadın<br/>
              <span onClick={()=>{setScreen("app");setShowPost(true);}}
                style={{ fontSize:12, color:fg, fontWeight:700, cursor:"pointer",
                  textDecoration:"underline", display:"inline-block", marginTop:8 }}>
                İlk derdini paylaş →
              </span>
            </div>
          ) : myDerts.map((d,i) => <DertCard key={d.id} dert={d} i={i}
              user={user} openId={openId} setOpenId={setOpenId}
              cTexts={cTexts} setCTexts={setCTexts} cWarns={cWarns} setCWarns={setCWarns} cAnon={cAnon} setCAnon={setCAnon}
              onRate={handleRate} onComment={handleComment} onEdit={handleEdit}
              onEditDert={handleEditDert} onRelate={handleRelate} onClose={handleClose} onDelete={handleDelete} onDeleteComment={handleDeleteComment} onBlock={handleBlockUser} onThank={handleThankYou} onLike={handleLike} onReport={handleReport} onNeedAuth={needAuth} dark={dark} userAvatar={userAvatar}/>)}

          {myComments.length>0 && <>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:3, textTransform:"uppercase",
              color:muted, marginBottom:14, marginTop:24 }}>Dermanlarım ({myComments.length})</div>
            {myComments.map(c => (
              <div key={c.id} style={{ background:bg0, border:`2px solid ${bdr}`,
                padding:"14px 18px", marginBottom:10 }}>
                <div style={{ fontSize:9, color:muted, fontWeight:700, letterSpacing:1.5,
                  textTransform:"uppercase", marginBottom:8, wordBreak:"break-word" }}>"{c.dertTitle}"</div>
                <p style={{ margin:"0 0 10px", fontSize:13, lineHeight:1.75,
                  wordBreak:"break-word", color:fg }}>{c.text}</p>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  {c.ownerRated ? (
                    <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0 }}>
                      <ScoreBar value={c.stars} inv={false}/>
                      {c.badge && <Badge type={c.badge}/>}
                    </div>
                  ) : (
                    <span style={{ fontSize:11, color:muted, fontStyle:"italic" }}>Henüz puanlanmadı</span>
                  )}
                </div>
              </div>
            ))}
          </>}
        </>}

        {/* ── ROZETLER ── */}
        {profileTab === "rozetler" && (
          <div>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:3,
              textTransform:"uppercase", color:muted, marginBottom:16 }}>
              Rozetler ({myAchievements.filter(a=>a.earned).length}/{myAchievements.length})
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              {myAchievements.map(a => (
                <div key={a.id} style={{
                  background: a.earned
                    ? (dark ? "linear-gradient(135deg,#1a2a1a,#2a3a2a)" : "linear-gradient(135deg,#f0faf0,#e8f5e9)")
                    : bg0,
                  border: `1.5px solid ${a.earned ? "#27ae60" : bdr}`,
                  borderRadius:12, padding:"16px 12px", textAlign:"center",
                  opacity: a.earned ? 1 : 0.45,
                  transition:"all .2s",
                  boxShadow: a.earned ? "0 2px 12px rgba(39,174,96,.15)" : "none"
                }}>
                  <div style={{ fontSize:28, marginBottom:8,
                    filter: a.earned ? "none" : "grayscale(1)" }}>{a.icon}</div>
                  <div style={{ fontSize:12, fontWeight:800, color:fg, marginBottom:4 }}>{a.label}</div>
                  <div style={{ fontSize:10, color:muted, lineHeight:1.4 }}>{a.desc}</div>
                  {a.earned && (
                    <div style={{ fontSize:9, color:"#27ae60", fontWeight:700,
                      marginTop:8, letterSpacing:1 }}>✓ KAZANILDI</div>
                  )}
                </div>
              ))}
            </div>

            {/* İlerleme özeti */}
            <div style={{ marginTop:20, background:bg0, border:`1.5px solid ${bdr}`,
              borderRadius:12, padding:"16px 18px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:fg, marginBottom:12 }}>İlerleme</div>
              {[
                ["Dert", myDerts.length, 10, "📝"],
                ["Derman", myComments.length, 20, "💬"],
                ["Altın", myGold, 3, "⭐"],
              ].map(([label, val, max, icon]) => (
                <div key={label} style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between",
                    fontSize:11, color:muted, marginBottom:5 }}>
                    <span>{icon} {label}</span>
                    <span style={{ fontWeight:700, color:fg }}>{val}/{max}</span>
                  </div>
                  <div style={{ height:6, background:dark?"#2a2a2a":"#f0f0f0",
                    borderRadius:3, overflow:"hidden" }}>
                    <div style={{
                      height:"100%", borderRadius:3,
                      width:`${Math.min(100,(val/max)*100)}%`,
                      background: val >= max
                        ? "linear-gradient(90deg,#27ae60,#2ecc71)"
                        : "linear-gradient(90deg,#111,#444)",
                      transition:"width .6s cubic-bezier(.22,1,.36,1)"
                    }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── BİLDİRİMLER ── */}
        {profileTab === "bildirimler" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:3,
                textTransform:"uppercase", color:muted }}>
                Bildirimler ({notifs.filter(n=>!n.is_read).length} okunmamış)
              </div>
              {notifs.some(n=>!n.is_read) && (
                <button onClick={markAllRead}
                  style={{ fontSize:11, color:muted, background:"none", border:"none",
                    cursor:"pointer", textDecoration:"underline" }}>
                  Tümünü okundu işaretle
                </button>
              )}
            </div>

            {notifsLoading ? (
              <div style={{ textAlign:"center", padding:40, color:muted }}>Yükleniyor...</div>
            ) : notifs.length === 0 ? (
              <div style={{ border:`2px dashed ${bdr}`, padding:40, textAlign:"center",
                color:muted, fontSize:13 }}>
                <div style={{ fontSize:36, marginBottom:12 }}>🔔</div>
                Henüz bildirim yok
              </div>
            ) : notifs.map(n => (
              <div key={n.id} onClick={async()=>{
                // Okundu işaretle
                if (!n.is_read) {
                  await supabase.from("notifications").update({is_read:true}).eq("id",n.id);
                  setNotifs(prev=>prev.map(x=>x.id===n.id?{...x,is_read:true}:x));
                }
                // Derte git — hash routing ile en güvenli yöntem
                if (n.dert_id) {
                  setCat("Hepsi");
                  setSearch("");
                  setSortBy("new");
                  setPage(999);
                  setTab("feed");
                  setScreen("app");
                  // Derts yüklendikten sonra openId set et ve scroll et
                  const tryOpen = (attempts=0) => {
                    const el = document.getElementById("dert-"+n.dert_id);
                    if (el) {
                      setOpenId(n.dert_id);
                      el.scrollIntoView({behavior:"smooth", block:"center"});
                    } else if (attempts < 15) {
                      setTimeout(()=>tryOpen(attempts+1), 200);
                    } else {
                      // Son çare: openId set et, dert pagedFiltered'a girecek
                      setOpenId(n.dert_id);
                    }
                  };
                  setTimeout(()=>tryOpen(), 400);
                }
              }} style={{
                background: n.is_read ? bg0 : (dark?"#1a2a1a":"#f0faf0"),
                border: `1.5px solid ${n.is_read ? bdr : "#27ae60"}`,
                borderLeft: `4px solid ${n.is_read ? bdr : "#27ae60"}`,
                borderRadius: "0 10px 10px 0",
                padding:"14px 16px", marginBottom:8, cursor:"pointer",
                boxShadow: n.is_read ? "none" : "0 2px 12px rgba(39,174,96,.1)",
                transition:"all .15s"
              }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                  <span style={{ fontSize:20, flexShrink:0 }}>
                    {n.type==="new_derman"?"💬":n.type==="thanks"?"🙏":n.type==="rated"?"⭐":"🔔"}
                  </span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, color:fg, lineHeight:1.5, marginBottom:4 }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize:10, color:muted }}>
                      {new Date(n.created_at).toLocaleString("tr-TR")}
                      {n.dert_id && <span style={{ marginLeft:8, color:fg, fontWeight:700 }}>→ Derte git</span>}
                    </div>
                  </div>
                  {!n.is_read && (
                    <div style={{ width:8, height:8, borderRadius:"50%",
                      background:"#27ae60", flexShrink:0, marginTop:4 }}/>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── AYARLAR ── */}
        {profileTab === "ayarlar" && (
          <div>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:3,
              textTransform:"uppercase", color:muted, marginBottom:16 }}>Hesap Ayarları</div>

            {/* Şifre değiştir */}
            <div style={{ background:bg0, border:`1.5px solid ${bdr}`, borderRadius:12, padding:"20px", marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:800, color:fg, marginBottom:4 }}>🔑 Şifre Değiştir</div>
              <div style={{ fontSize:11, color:muted, marginBottom:14 }}>Hesap güvenliğin için şifreni düzenli değiştir.</div>
              {!showChangePw ? (
                <button onClick={()=>setShowChangePw(true)}
                  style={{ padding:"9px 20px", background:"#111", color:"#fff",
                    border:"2px solid #111", cursor:"pointer",
                    fontFamily:"'Inter',system-ui,sans-serif", fontSize:12, fontWeight:700 }}>
                  Şifremi Değiştir
                </button>
              ) : (
                <div>
                  {changePwErr && (
                    <div style={{ background:"#fff3f3", border:"1.5px solid #c0392b",
                      padding:"8px 12px", marginBottom:10, fontSize:12, color:"#c0392b", fontWeight:700 }}>
                      ⚠ {changePwErr}
                    </div>
                  )}
                  {changePwOk && (
                    <div style={{ background:"#f0faf0", border:"1.5px solid #27ae60",
                      padding:"8px 12px", marginBottom:10, fontSize:12, color:"#27ae60", fontWeight:700 }}>
                      ✅ Şifren güncellendi!
                    </div>
                  )}
                  <input type="password" placeholder="Yeni şifre (en az 6 karakter)"
                    value={changePw1} onChange={e=>setChangePw1(e.target.value)}
                    style={{ width:"100%", padding:"10px 13px", marginBottom:8, boxSizing:"border-box",
                      border:`2px solid ${bdr}`, fontFamily:"'Inter',system-ui,sans-serif",
                      fontSize:13, outline:"none", background:bg0, color:fg }}/>
                  <input type="password" placeholder="Şifreyi tekrar gir"
                    value={changePw2} onChange={e=>setChangePw2(e.target.value)}
                    style={{ width:"100%", padding:"10px 13px", marginBottom:12, boxSizing:"border-box",
                      border:`2px solid ${bdr}`, fontFamily:"'Inter',system-ui,sans-serif",
                      fontSize:13, outline:"none", background:bg0, color:fg }}/>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={async()=>{
                      setChangePwErr(""); setChangePwOk(false);
                      if (changePw1.length < 6) { setChangePwErr("En az 6 karakter olmalı."); return; }
                      if (changePw1 !== changePw2) { setChangePwErr("Şifreler eşleşmiyor."); return; }
                      const { error } = await supabase.auth.updateUser({ password: changePw1 });
                      if (error) { setChangePwErr(error.message); return; }
                      setChangePwOk(true); setChangePw1(""); setChangePw2("");
                      setTimeout(()=>setShowChangePw(false), 2000);
                    }} style={{ flex:1, padding:"10px", background:"#111", color:"#fff",
                      border:"2px solid #111", cursor:"pointer",
                      fontFamily:"'Inter',system-ui,sans-serif", fontSize:12, fontWeight:700 }}>
                      Güncelle →
                    </button>
                    <button onClick={()=>{setShowChangePw(false);setChangePwErr("");setChangePwOk(false);}}
                      style={{ padding:"10px 16px", background:bg0, color:muted,
                        border:`1.5px solid ${bdr}`, cursor:"pointer",
                        fontFamily:"'Inter',system-ui,sans-serif", fontSize:12 }}>
                      İptal
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Çıkış ve hesap silme */}
            <div style={{ background:bg0, border:`1.5px solid ${bdr}`, borderRadius:12, padding:"20px", marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:800, color:fg, marginBottom:14 }}>Hesap İşlemleri</div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                <button onClick={handleLogout}
                  style={{ padding:"10px 24px", background:bg0, color:muted,
                    border:`1.5px solid ${bdr}`, borderRadius:8, cursor:"pointer",
                    fontFamily:"'Inter',system-ui,sans-serif", fontSize:12, fontWeight:700 }}>
                  Çıkış Yap
                </button>
                <button onClick={handleDeleteAccount}
                  style={{ padding:"10px 24px", background:"#fff0f0", color:"#c0392b",
                    border:"1.5px solid #ffcccc", borderRadius:8, cursor:"pointer",
                    fontFamily:"'Inter',system-ui,sans-serif", fontSize:12, fontWeight:700 }}>
                  Hesabı Sil
                </button>
              </div>
            </div>

            {/* Engellenen kullanıcılar */}
            {blockedUsers.length > 0 && (
              <div style={{ background:bg0, border:`1.5px solid ${bdr}`, borderRadius:12, padding:"20px" }}>
                <div style={{ fontSize:13, fontWeight:800, color:fg, marginBottom:4 }}>
                  🚫 Engellenen Kullanıcılar
                </div>
                <div style={{ fontSize:11, color:muted, marginBottom:14 }}>
                  Bu kullanıcıların dertleri feed'de gözükmez.
                </div>
                {blockedUsers.map(id => {
                  // id'den kullanıcı adını bul
                  const blockedUser = derts.find(d=>d.authorId===id);
                  const name = blockedUser?.author || id.slice(0,8)+"...";
                  return (
                    <div key={id} style={{ display:"flex", alignItems:"center",
                      justifyContent:"space-between", padding:"8px 0",
                      borderBottom:`1px solid ${bdr}` }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <Av char={name[0]?.toUpperCase()||"?"} inv={!dark} size={28}/>
                        <span style={{ fontSize:13, fontWeight:600, color:fg }}>{name}</span>
                      </div>
                      <button onClick={()=>{
                        const updated = blockedUsers.filter(b=>b!==id);
                        setBlockedUsers(updated);
                        try { localStorage.setItem("derthanem_blocked_"+user.id, JSON.stringify(updated)); } catch(e) {}
                        showToast("edit_dert");
                      }} style={{ padding:"4px 12px", background:"#fff0f0", color:"#c0392b",
                        border:"1px solid #ffcccc", borderRadius:6, cursor:"pointer",
                        fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700 }}>
                        Engeli Kaldır
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {auth && <AuthModal mode={auth} onClose={()=>setAuth(null)} onAuth={handleAuth} onVerifyEmail={(email)=>{setVerifyEmail(email);setAuth(null);}}/>}
    </div>
  );

  /* ══ APP ══ */
  return (
    <div style={{ minHeight:"100vh", background:bg1, fontFamily:"'Inter',system-ui,sans-serif", color:fg }}
      onClick={()=>showNotifs&&setShowNotifs(false)}>
      <CSS/><Toast toast={toast}/>
      {showOnboard && <Onboarding onClose={()=>setShowOnboard(false)} fg={fg} bg0={bg0} bdr={bdr}/>}

      {/* PWA Kurulum Banner */}
      {showPwa && (
        <div style={{ position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)",
          zIndex:1000, width:"min(380px, calc(100vw - 32px))",
          background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)",
          color:"#fff", borderRadius:16, padding:"16px 18px",
          boxShadow:"0 8px 32px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08)",
          display:"flex", alignItems:"center", gap:12,
          animation:"fu .4s cubic-bezier(.22,1,.36,1)" }}>
          <div style={{ fontSize:28, flexShrink:0 }}>📱</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:13 }}>Ana Ekrana Ekle</div>
            <div style={{ fontSize:11, opacity:.6, marginTop:2 }}>
              Derthanem'i uygulama gibi kullan
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={async()=>{
              if (pwaPrompt) {
                pwaPrompt.prompt();
                const { outcome } = await pwaPrompt.userChoice;
                if (outcome === "accepted") setShowPwa(false);
              }
            }} style={{ padding:"7px 14px", background:"#fff", color:"#111",
              border:"none", borderRadius:8, cursor:"pointer",
              fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:800 }}>
              Ekle
            </button>
            <button onClick={()=>{
              setShowPwa(false);
              localStorage.setItem("derthanem_pwa_dismissed","1");
            }} style={{ padding:"7px 10px", background:"rgba(255,255,255,.1)",
              color:"#fff", border:"none", borderRadius:8, cursor:"pointer",
              fontFamily:"'Inter',system-ui,sans-serif", fontSize:11 }}>
              ✕
            </button>
          </div>
        </div>
      )}
      <Header/>

      <div style={{ maxWidth:700, margin:"0 auto", padding:"0 16px 60px" }}>

        {/* Post form */}
        {showPost && user && (
          <div className="dc" style={{ margin:"20px 0 0", background:bg0,
            border:`1.5px solid ${bdr}`, borderRadius:16, padding:"22px 24px",
            boxShadow:`0 8px 32px rgba(0,0,0,.1)` }}>
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
                fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, background:"#fff",
                cursor:"pointer", fontWeight:700, letterSpacing:1, textTransform:"uppercase" }}>
              {CATS.slice(1).map(c=><option key={c}>{c}</option>)}
            </select>

            <input value={postForm.title}
              onChange={e=>{setPostForm(p=>({...p,title:e.target.value}));setPostWarn("");}}
              placeholder="Derdini tek cümleyle özetle…"
              style={{ width:"100%", padding:"12px 13px", marginBottom:8,
                border:`2px solid ${postWarn&&!postForm.title.trim()?"#c0392b":"#ddd"}`,
                boxSizing:"border-box", fontFamily:"'Inter',system-ui,sans-serif",
                fontSize:15, fontWeight:700, background:bg0, color:fg, outline:"none" }}/>

            <textarea value={postForm.content}
              onChange={e=>{setPostForm(p=>({...p,content:e.target.value}));setPostWarn("");}}
              placeholder="Olanları anlat. Burada herkes seni dinliyor…" rows={4}
              style={{ width:"100%", padding:"12px 13px", marginBottom:8,
                border:`2px solid ${postWarn&&!postForm.content.trim()?"#c0392b":"#ddd"}`,
                boxSizing:"border-box",
                fontFamily:"'Inter',system-ui,sans-serif", fontSize:14, resize:"vertical",
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
                background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)", color:"#fff", border:"1px solid #1a1a1a",
                fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700,
                cursor:"pointer", letterSpacing:1, boxShadow:"4px 4px 0 #555" }}>
                Derdimi Paylaş →
              </button>
              <button onClick={closePostForm}
                style={{ padding:"12px 18px", background:bg0,
                  border:`2px solid ${dark?"#333":"#ddd"}`, fontFamily:"'Inter',system-ui,sans-serif",
                  fontSize:13, cursor:"pointer", color:fg }}>Vazgeç</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:"flex", gap:6, marginTop:20, marginBottom:4,
          background: dark?"#1a1a1a":"#f0f0f0",
          padding:4, borderRadius:12 }}>
          {[["feed","Dertler"],["board","Dert Ustaları"],["stats","İstatistikler"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} style={{
              flex:1, padding:"9px 12px", border:"none",
              fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700,
              cursor:"pointer", letterSpacing:.5, textTransform:"uppercase",
              borderRadius:9, transition:"all .2s cubic-bezier(.22,1,.36,1)",
              color: tab===id ? "#fff" : muted,
              background: tab===id
                ? "linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)"
                : "transparent",
              boxShadow: tab===id
                ? "0 2px 8px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08)"
                : "none",
            }}>{lbl}</button>
          ))}
          {/* Klavye kısayol ipucu */}
          <div style={{ display:"flex", alignItems:"center", gap:6,
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
          <div style={{ background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)", color:"#fff", padding:"13px 18px",
            marginTop:16, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"space-between",
            fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700,
            boxShadow:"0 4px 16px rgba(0,0,0,.25)", animation:"fu .4s ease" }}>
            <span>{welcomeMsg}</span>
            <button onClick={()=>setWelcomeMsg(null)} style={{ background:"none", border:"none",
              color:"rgba(255,255,255,.5)", cursor:"pointer", fontSize:16, padding:"0 4px" }}>✕</button>
          </div>
        )}

        {/* ── FEED ── */}
        {tab==="feed" && (<>

          {/* Haftalık öne çıkan dert */}
          {weeklyHot && !search && cat==="Hepsi" && (
            <div onClick={()=>{
              setOpenId(weeklyHot.id);
              setTimeout(()=>{
                const el = document.getElementById("dert-"+weeklyHot.id);
                if (el) el.scrollIntoView({behavior:"smooth", block:"center"});
              }, 100);
            }}
              style={{ background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)",
                color:"#fff", borderRadius:14, padding:"14px 18px", marginTop:16, marginBottom:4,
                cursor:"pointer", boxShadow:"0 4px 20px rgba(15,52,96,.4)",
                display:"flex", alignItems:"center", gap:12,
                border:"1px solid rgba(255,255,255,.08)",
                animation:"fu .4s ease" }}>
              <div style={{ fontSize:28, flexShrink:0 }}>🔥</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:3,
                  textTransform:"uppercase", opacity:.5, marginBottom:4 }}>
                  Haftanın En Çok Konuşulanı
                </div>
                <div style={{ fontSize:14, fontWeight:700, lineHeight:1.3,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {weeklyHot.title}
                </div>
                <div style={{ fontSize:11, opacity:.5, marginTop:3 }}>
                  {weeklyHot.comments.length} derman · {weeklyHot.category}
                </div>
              </div>
              <div style={{ fontSize:11, opacity:.4, flexShrink:0 }}>→</div>
            </div>
          )}

          {/* Arama */}
          <div style={{ margin:"16px 0 0", position:"relative" }}>
            <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)",
              fontSize:14, opacity:.35, pointerEvents:"none" }}>🔍</span>
            <input
              value={search}
              onChange={e=>setSearch(e.target.value)}
              placeholder="Dertlerde ara…"
              style={{ width:"100%", padding:"10px 13px 10px 36px", boxSizing:"border-box",
                border:`1.5px solid ${bdr}`, borderRadius:10,
                fontFamily:"'Inter',system-ui,sans-serif", fontSize:13,
                background:bg0, color:fg, outline:"none" }}
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
              <button key={v} onClick={()=>{ setSortBy(v); setPage(1); }}
                style={{ flexShrink:0, padding:"6px 14px", fontSize:10, fontWeight:700,
                  letterSpacing:.5, textTransform:"uppercase", borderRadius:20,
                  background: sortBy===v
                    ? "linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)"
                    : bg0,
                  color: sortBy===v ? "#fff" : muted,
                  border: `1.5px solid ${sortBy===v ? "transparent" : dark?"#333":"#e0e0e0"}`,
                  boxShadow: sortBy===v ? "0 2px 8px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.08)" : "none",
                  cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
                  transition:"all .2s", whiteSpace:"nowrap" }}>{l}</button>
            ))}
          </div>

          {/* Kategoriler */}
          <div style={{ display:"flex", gap:6, overflowX:"auto", padding:"12px 0 10px", scrollbarWidth:"none" }}>
            {CATS.map(c=>(
              <button key={c} onClick={()=>{ setCat(c); setPage(1); }}
                className="cat-btn"
                style={{ flexShrink:0, padding:"6px 14px",
                  background: cat===c
                    ? "linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)"
                    : bg0,
                  color: cat===c ? "#fff" : fg,
                  border: `1.5px solid ${cat===c ? "transparent" : dark?"#333":"#e0e0e0"}`,
                  borderRadius:20,
                  boxShadow: cat===c ? "0 2px 8px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.08)" : "0 1px 3px rgba(0,0,0,.05)",
                  cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
                  fontSize:11, fontWeight:700,
                  display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap",
                  transition:"all .2s" }}>
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
            <div style={{ textAlign:"center", padding:"48px 24px" }}>
              <div style={{ fontSize:48, marginBottom:16 }}>
                {search ? "🔍" : cat !== "Hepsi" ? "🗂" : "✨"}
              </div>
              <div style={{ fontSize:18, fontWeight:800, color:fg, marginBottom:8,
                fontFamily:"'Playfair Display',Georgia,serif" }}>
                {search
                  ? "Sonuç bulunamadı"
                  : cat !== "Hepsi"
                    ? cat + " kategorisinde henüz dert yok"
                    : "Henüz hiç dert yok"}
              </div>
              <div style={{ fontSize:13, color:muted, lineHeight:1.7, maxWidth:280, margin:"0 auto 24px" }}>
                {search
                  ? '"' + search + '" için eşleşen bir dert bulunamadı. Farklı kelimeler dene.'
                  : "İlk derdi sen paylaş — topluluk sana derman olmak için burada!"}
              </div>
              {!search && user && (
                <button onClick={()=>{ setShowPost(true); }}
                  style={{ background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)", color:"#fff", border:"1px solid #1a1a1a",
                    padding:"12px 28px", cursor:"pointer",
                    fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700,
                    letterSpacing:.5, boxShadow:"3px 3px 0 #555" }}>
                  + Derdini Dök
                </button>
              )}
              {!user && (
                <button onClick={()=>needAuth("register")}
                  style={{ background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)", color:"#fff", border:"1px solid #1a1a1a",
                    padding:"12px 28px", cursor:"pointer",
                    fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700,
                    letterSpacing:.5, boxShadow:"3px 3px 0 #555" }}>
                  Üye Ol, Derdini Dök
                </button>
              )}
            </div>
          )}
          {/* Sonuç yok */}
          {pagedFiltered.length === 0 && (
            <div style={{ border:`2px dashed ${bdr}`, borderRadius:12,
              padding:"40px 20px", textAlign:"center", color:muted, marginTop:16 }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:14, fontWeight:700, color:fg, marginBottom:6 }}>
                {search ? `"${search}" için sonuç bulunamadı` : "Henüz dert yok"}
              </div>
              <div style={{ fontSize:12 }}>
                {search ? "Farklı kelimeler dene" : "İlk derdi sen paylaş!"}
              </div>
            </div>
          )}

          {pagedFiltered.map((d,i) => {
            const isUnsolved = !d.solved && d.comments.length===0;
            return (
              <div key={d.id} style={{ position:"relative" }}>
                {isUnsolved && (
                  <div style={{
                    position:"absolute", top:12, right:12, zIndex:2,
                    fontSize:9, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase",
                    background:"#fff3cd", color:"#856404",
                    border:"1.5px solid #ffc107", borderRadius:6, padding:"3px 8px",
                    pointerEvents:"none"
                  }}>⏳ Derman Bekleniyor</div>
                )}
                <DertCard dert={d} i={i} isNew={!!d.isNew}
                  user={user} openId={openId} setOpenId={setOpenId}
                  cTexts={cTexts} setCTexts={setCTexts} cWarns={cWarns} setCWarns={setCWarns} cAnon={cAnon} setCAnon={setCAnon}
                  onRate={handleRate} onComment={handleComment} onEdit={handleEdit}
                  onEditDert={handleEditDert} onRelate={handleRelate} onClose={handleClose} onDelete={handleDelete} onDeleteComment={handleDeleteComment} onBlock={handleBlockUser} onThank={handleThankYou} onLike={handleLike} onReport={handleReport} onNeedAuth={needAuth} dark={dark} userAvatar={userAvatar}/>
              </div>
            );
          })}

          {/* Daha Fazla Göster */}
          {pagedFiltered.length < filtered.length && (
            <button onClick={()=>setPage(p=>p+1)}
              style={{ width:"100%", padding:"14px", background:bg0, color:fg,
                border:`1.5px solid ${bdr}`, borderRadius:10, cursor:"pointer",
                fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700,
                letterSpacing:.5, marginTop:8, transition:"all .15s" }}>
              Daha Fazla Göster ({filtered.length - pagedFiltered.length} dert daha)
            </button>
          )}
        </>)}

        {/* ── LEADERBOARD ── */}
        {tab==="board" && (
          <div style={{ paddingTop:22 }}>
            <div style={{ paddingBottom:18, marginBottom:20, borderBottom:`2px solid ${bdr}` }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:5,
                textTransform:"uppercase", color:muted, marginBottom:6 }}>✦ Topluluk Şampiyonları</div>
              <div style={{ fontSize:28, fontWeight:900, letterSpacing:"-1.5px", color:fg,
                fontFamily:"'Playfair Display',Georgia,serif" }}>Dert Ustaları</div>
              <div style={{ fontSize:12, color:muted, marginTop:6, fontWeight:500 }}>
                En yüksek puan ortalamasına sahip derman yazarları
              </div>
            </div>

            {/* Cinsiyet sekmeleri */}
            <div style={{ display:"flex", gap:0, marginBottom:24,
              border:`2px solid ${bdr}`, overflow:"hidden" }}>
              {[
                ["all",    "✦ Tümü"],
                ["male",   "👨 Dert Babası"],
                ["female", "👩 Dert Anası"],
              ].map(([id, label]) => (
                <button key={id} onClick={()=>setBoardTab(id)}
                  style={{ flex:1, padding:"11px 8px",
                    background: boardTab===id ? "#111" : bg0,
                    color: boardTab===id ? "#fff" : muted,
                    border:"none", borderRight: id!=="female" ? `2px solid ${bdr}` : "none",
                    cursor:"pointer", fontFamily:"'Inter',system-ui,sans-serif",
                    fontSize:11, fontWeight:700, letterSpacing:.5,
                    transition:"all .15s" }}>
                  {label}
                </button>
              ))}
            </div>

            {(() => {
              const filtered_board = boardTab === "all"
                ? board
                : board.filter(u => u.gender === boardTab);

              return filtered_board.length === 0 ? (
                <div style={{ border:`2px dashed ${dark?"#333":"#ddd"}`, padding:40,
                  textAlign:"center", color:muted, fontSize:13 }}>
                  {boardTab === "all"
                    ? "Henüz puanlama yapılmadı — ilk dermanı yaz!"
                    : boardTab === "male"
                      ? "Henüz Dert Babası yok"
                      : "Henüz Dert Anası yok"}
                </div>
              ) : (<>
                {/* PODYUM — İlk 3 */}
                {filtered_board.length>=1 && (
                  <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"center",
                    gap:10, marginBottom:4, padding:"0 4px" }}>

                    {/* 2. */}
                    {filtered_board.length>=2 && (
                      <div style={{ flex:1, textAlign:"center" }}>
                        <div style={{ fontSize:18, marginBottom:8 }}>🥈</div>
                        <Av char={filtered_board[1].avatar} inv={!dark} size={48}/>
                        <div style={{ fontSize:13, fontWeight:800, marginTop:10, color:fg,
                          wordBreak:"break-word", lineHeight:1.3,
                          background: user?.id===filtered_board[1].authorId ? (dark?"rgba(255,255,255,.1)":"rgba(0,0,0,.05)") : "transparent",
                          padding:"4px 6px", borderRadius:4 }}>
                          {filtered_board[1].name}
                          {user?.id===filtered_board[1].authorId && <span style={{ fontSize:9, display:"block", opacity:.5 }}>sen</span>}
                        </div>
                        <div style={{ fontSize:20, fontWeight:900, color:fg, marginTop:4 }}>
                          {filtered_board[1].avg}<span style={{ fontSize:10, opacity:.4, fontWeight:500 }}>/10</span>
                        </div>
                        <div style={{ fontSize:9, color:muted, marginBottom:10 }}>
                          {filtered_board[1].count} derman
                        </div>
                        <div style={{ height:70, background:dark?"#2a2a2a":"#f0f0f0",
                          border:`2px solid ${bdr}`, display:"flex",
                          alignItems:"center", justifyContent:"center", borderBottom:"none" }}>
                          <span style={{ fontSize:28, fontWeight:900, opacity:.15 }}>2</span>
                        </div>
                      </div>
                    )}

                    {/* 1. */}
                    <div style={{ flex:1.2, textAlign:"center" }}>
                      <div style={{ fontSize:24, marginBottom:8 }}>👑</div>
                      <Av char={filtered_board[0].avatar} inv size={60}/>
                      <div style={{ fontSize:14, fontWeight:800, marginTop:10, color:fg,
                        wordBreak:"break-word", lineHeight:1.3,
                        background: user?.id===filtered_board[0].authorId ? (dark?"rgba(255,255,255,.1)":"rgba(0,0,0,.05)") : "transparent",
                        padding:"4px 8px", borderRadius:4 }}>
                        {filtered_board[0].name}
                        {user?.id===filtered_board[0].authorId && <span style={{ fontSize:9, display:"block", opacity:.5 }}>sen</span>}
                      </div>
                      <div style={{ fontSize:24, fontWeight:900, color:fg, marginTop:4 }}>
                        {filtered_board[0].avg}<span style={{ fontSize:12, opacity:.4, fontWeight:500 }}>/10</span>
                      </div>
                      <div style={{ fontSize:9, color:muted, marginBottom:10 }}>
                        {filtered_board[0].count} derman
                      </div>
                      <div style={{ height:100,
                        background:"linear-gradient(180deg,#2a2a2a 0%,#111 50%,#050505 100%)",
                        border:"2px solid #111", display:"flex",
                        alignItems:"center", justifyContent:"center", borderBottom:"none",
                        boxShadow:"0 -4px 20px rgba(0,0,0,.15)" }}>
                        <span style={{ fontSize:36, color:"#fff", opacity:.12, fontWeight:900 }}>1</span>
                      </div>
                    </div>

                    {/* 3. */}
                    {filtered_board.length>=3 && (
                      <div style={{ flex:1, textAlign:"center" }}>
                        <div style={{ fontSize:18, marginBottom:8 }}>🥉</div>
                        <Av char={filtered_board[2].avatar} inv={!dark} size={44}/>
                        <div style={{ fontSize:12, fontWeight:800, marginTop:10, color:fg,
                          wordBreak:"break-word", lineHeight:1.3,
                          background: user?.id===filtered_board[2].authorId ? (dark?"rgba(255,255,255,.1)":"rgba(0,0,0,.05)") : "transparent",
                          padding:"4px 6px", borderRadius:4 }}>
                          {filtered_board[2].name}
                          {user?.id===filtered_board[2].authorId && <span style={{ fontSize:9, display:"block", opacity:.5 }}>sen</span>}
                        </div>
                        <div style={{ fontSize:18, fontWeight:900, color:fg, marginTop:4 }}>
                          {filtered_board[2].avg}<span style={{ fontSize:10, opacity:.4, fontWeight:500 }}>/10</span>
                        </div>
                        <div style={{ fontSize:9, color:muted, marginBottom:10 }}>
                          {filtered_board[2].count} derman
                        </div>
                        <div style={{ height:50, background:dark?"#2a2a2a":"#f0f0f0",
                          border:`2px solid ${bdr}`, display:"flex",
                          alignItems:"center", justifyContent:"center", borderBottom:"none" }}>
                          <span style={{ fontSize:22, fontWeight:900, opacity:.15 }}>3</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Podyum zemin */}
                <div style={{ height:3, background:`linear-gradient(90deg,transparent,${dark?"#333":"#e0e0e0"},transparent)`,
                  marginBottom:24, marginTop:-2 }}/>

                {/* 4. ve sonrası */}
                {filtered_board.slice(3).map((u,i)=>{
                  const isMe = user?.id === u.authorId;
                  return (
                  <div key={u.authorId} style={{ background: isMe ? (dark?"#1a2a1a":"#f0faf0") : bg0,
                    color:fg, border: isMe ? "2px solid #27ae60" : `1.5px solid ${bdr}`,
                    padding:"14px 18px", marginBottom:8,
                    display:"flex", alignItems:"center", gap:14 }}>
                    <div style={{ fontSize:14, fontWeight:900, minWidth:28, textAlign:"center",
                      opacity:.35, flexShrink:0 }}>{i+4}</div>
                    <Av char={u.avatar} inv={!dark} size={36}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, display:"flex", alignItems:"center", gap:6 }}>
                        {u.name}
                        {isMe && <span style={{ fontSize:9, background:"#27ae60", color:"#fff",
                          padding:"1px 6px", fontWeight:700, letterSpacing:1 }}>SEN</span>}
                      </div>
                      <div style={{ fontSize:9, fontWeight:700, letterSpacing:2,
                        textTransform:"uppercase", opacity:.4, marginTop:3 }}>
                        {u.count} derman · {u.gold>0 && "⭐"}{u.silver>0 && "✦"} ort. {u.avg}/10
                      </div>
                    </div>
                    <div style={{ fontSize:20, fontWeight:900, color:fg, flexShrink:0 }}>
                      {u.avg}<span style={{ fontSize:10, opacity:.4 }}>/10</span>
                    </div>
                  </div>
                  );
                })}
              </>);
            })()}

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
                    fontFamily:"'Inter',system-ui,sans-serif", fontSize:11, fontWeight:700,
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
            <div style={{ paddingBottom:18, marginBottom:20, borderBottom:`1.5px solid ${bdr}` }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:4,
                textTransform:"uppercase", color:muted, marginBottom:5 }}>Anlık Veriler</div>
              <div style={{ fontSize:26, fontWeight:900, letterSpacing:"-1px", color:fg,
                fontFamily:"'Playfair Display',Georgia,serif" }}>Topluluk İstatistikleri</div>
            </div>

            {/* Ana metrik kartları */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {[
                { label:"Toplam Dert",    value:stats.total,      icon:"😔", desc:"paylaşılan" },
                { label:"Dermana Ulaştı", value:stats.solved,     icon:"⭐", desc:"çözüldü" },
                { label:"Derman Bekliyor",value:stats.waiting,    icon:"⏳", desc:"henüz yanıt yok" },
                { label:"Ort. Derman",    value:stats.avgDerman,  icon:"💬", desc:"dert başına" },
              ].map(({label,value,icon,desc})=>(
                <div key={label} style={{ background:bg0, border:`1.5px solid ${bdr}`,
                  padding:"18px 16px", borderRadius:12,
                  boxShadow:"0 2px 8px rgba(0,0,0,.06)" }}>
                  <div style={{ fontSize:22 }}>{icon}</div>
                  <div style={{ fontSize:28, fontWeight:900, letterSpacing:"-1px",
                    marginTop:8, lineHeight:1, color:fg }}>{value}</div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5,
                    textTransform:"uppercase", color:muted, marginTop:6 }}>{label}</div>
                  <div style={{ fontSize:10, color:muted, marginTop:2 }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* Kapatılan dertler */}
            {stats.closed > 0 && (
              <div style={{ background:dark?"#2a2a2a":bg0, border:`1.5px solid ${bdr}`,
                borderRadius:10, padding:"14px 18px", marginBottom:10, display:"flex",
                alignItems:"center", gap:12 }}>
                <span style={{ fontSize:20 }}>🔒</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:fg }}>{stats.closed} dert kapatıldı</div>
                  <div style={{ fontSize:11, color:muted, marginTop:2 }}>
                    Sahipleri "Derdim Geçti" dedi — derman gelmese de iyileştiler
                  </div>
                </div>
              </div>
            )}

            {/* En çok dert açılan kategori */}
            {stats.topCat && (
              <div style={{ background:"linear-gradient(160deg,#2d2d2d 0%,#111 55%,#080808 100%)",
                color:"#fff", border:"none", borderRadius:12,
                padding:"18px 20px", marginBottom:10,
                boxShadow:"0 4px 16px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.08)" }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:3,
                  textTransform:"uppercase", opacity:.4, marginBottom:8 }}>
                  En Çok Dert Açılan Kategori
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:28 }}>{CAT_ICONS[stats.topCat[0]]}</span>
                  <div>
                    <div style={{ fontSize:20, fontWeight:900 }}>{stats.topCat[0]}</div>
                    <div style={{ fontSize:12, opacity:.5, marginTop:2 }}>
                      {stats.topCat[1]} dert · toplam dertin %{Math.round(stats.topCat[1]/stats.total*100)}'i
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Kategori dağılımı */}
            <div style={{ background:bg0, border:`1.5px solid ${bdr}`,
              borderRadius:12, padding:"18px 20px", marginBottom:10 }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:3,
                textTransform:"uppercase", color:muted, marginBottom:14 }}>
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
                        alignItems:"center", gap:6, color:fg }}>
                        <span>{CAT_ICONS[c]}</span>{c}
                      </span>
                      <span style={{ fontSize:11, color:muted }}>{count} dert · %{pct}</span>
                    </div>
                    <div style={{ height:6, background:"#f0f0f0", border:"1px solid #eee" }}>
                      <div style={{ height:"100%",
                        background:"linear-gradient(90deg,#2d2d2d,#111)",
                        width:`${pct}%`, transition:"width .6s ease", borderRadius:2 }}/>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* En çok ortak olunan dert */}
            {stats.mostRelated && (
              <div style={{ border:`1.5px solid ${bdr}`, borderRadius:12,
                padding:"16px 20px", background:bg0, marginBottom:10 }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:3,
                  textTransform:"uppercase", color:muted, marginBottom:10 }}>
                  🤝 En Çok Ortak Olunan Dert
                </div>
                <div style={{ fontWeight:800, fontSize:14, marginBottom:4, color:fg }}>
                  {stats.mostRelated.title}
                </div>
                <div style={{ fontSize:12, color:muted }}>
                  {stats.maxRelate} kişi "Benimkine benziyor" dedi
                </div>
              </div>
            )}

            {/* Toplam derman */}
            <div style={{ border:`2px dashed ${bdr}`, borderRadius:12, padding:"22px 20px",
              textAlign:"center", color:muted, marginTop:10 }}>
              <div style={{ fontSize:40, fontWeight:900, color:fg, letterSpacing:"-1px" }}>
                {stats.totalComs}
              </div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:2,
                textTransform:"uppercase", marginTop:6, color:fg }}>
                Toplam Derman Yazıldı
              </div>
              <div style={{ fontSize:12, color:muted, marginTop:8 }}>
                Her biri bir insanın yüküne omuz vermek için 💙
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Geri Bildirim Butonu — sağ alt köşe */}
      <button onClick={()=>setShowFeedback(true)}
        style={{ position:"fixed", bottom:24, right:20, zIndex:300,
          background:"#111", color:"#fff", border:"none",
          width:48, height:48, borderRadius:"50%", cursor:"pointer",
          fontSize:20, display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow:"0 4px 16px rgba(0,0,0,.25)", transition:"transform .2s ease" }}
        title="Geri Bildirim Gönder"
        onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1)"}
        onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
        💬
      </button>

      {/* Geri Bildirim Modalı */}
      {showFeedback && (
        <div onClick={()=>setShowFeedback(false)}
          style={{ position:"fixed", inset:0, zIndex:4000,
            background:"rgba(0,0,0,.6)", backdropFilter:"blur(4px)",
            display:"flex", alignItems:"flex-end", justifyContent:"center",
            padding:"0 16px 32px" }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:bg0, width:"100%", maxWidth:480,
              border:`2px solid ${bdr}`, boxShadow:`8px 8px 0 ${dark?"#333":"#111"}`,
              fontFamily:"'Inter',system-ui,sans-serif", padding:"24px" }}>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:3,
              textTransform:"uppercase", color:muted, marginBottom:8 }}>
              Geri Bildirim
            </div>
            <div style={{ fontSize:20, fontWeight:900, color:fg, marginBottom:16 }}>
              Ne düşünüyorsun?
            </div>

            {/* Tür seçimi */}
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              {[["öneri","💡"],["hata","🐛"],["diğer","💬"]].map(([t,e])=>(
                <button key={t} onClick={()=>setFeedbackType(t)}
                  style={{ flex:1, padding:"8px 4px", border:`2px solid ${feedbackType===t?"#111":dark?"#333":"#ddd"}`,
                    background:feedbackType===t?"#111":bg0, color:feedbackType===t?"#fff":fg,
                    cursor:"pointer", fontSize:11, fontWeight:700, letterSpacing:.5 }}>
                  {e} {t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>

            <textarea
              value={feedbackText}
              onChange={e=>setFeedbackText(e.target.value.slice(0,500))}
              placeholder="Uygulama hakkında düşüncelerini yaz..."
              rows={4}
              style={{ width:"100%", padding:"12px", boxSizing:"border-box",
                border:`2px solid ${dark?"#333":"#ddd"}`, background:bg0, color:fg,
                fontFamily:"'Inter',system-ui,sans-serif", fontSize:13,
                lineHeight:1.7, resize:"vertical", outline:"none", marginBottom:12 }}
            />
            <div style={{ fontSize:10, color:muted, textAlign:"right",
              marginBottom:12 }}>{feedbackText.length}/500</div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={handleFeedback}
                style={{ flex:1, padding:"12px", background:"#111", color:"#fff",
                  border:"2px solid #111", cursor:"pointer",
                  fontFamily:"'Inter',system-ui,sans-serif", fontSize:13, fontWeight:700 }}>
                Gönder →
              </button>
              <button onClick={()=>setShowFeedback(false)}
                style={{ padding:"12px 20px", background:bg0, color:muted,
                  border:`2px solid ${dark?"#333":"#ddd"}`, cursor:"pointer",
                  fontFamily:"'Inter',system-ui,sans-serif", fontSize:13 }}>
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {auth && <AuthModal mode={auth} onClose={()=>setAuth(null)} onAuth={handleAuth} onVerifyEmail={(email)=>{setVerifyEmail(email);setAuth(null);}}/>}
    </div>
  );
}
