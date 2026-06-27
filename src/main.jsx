import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CircleDollarSign,
  Download,
  Edit3,
  FileSpreadsheet,
  MapPin,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
  X
} from "lucide-react";
import "./styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/ham-radio-meetings/sw.js").catch(() => {});
  });
}

const STORAGE_KEY = "ham-radio-meetings-v1";

const INITIAL_CALLSIGNS = [
  "HL5BFP",
  "HL5BEQ",
  "HL5MNO",
  "6K5EMR",
  "6K5EKP",
  "DS5JPO",
  "DS5PGD",
  "HL5JVF",
  "DS5AKY",
  "DS5IGC",
  "6K5ESG",
  "6K5EOO",
  "HL5JAD",
  "6K5EQV",
  "DS5COA",
  "HL5UIY",
  "HL5PLB",
  "DS5OQX"
];

const meetingStore = {
  list() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  },
  saveAll(meetings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
  },
  upsert(meeting) {
    const meetings = this.list();
    const index = meetings.findIndex((item) => item.id === meeting.id);
    const nextMeeting = enrichMeeting(meeting);
    const next = index >= 0 ? meetings.map((item) => (item.id === meeting.id ? nextMeeting : item)) : [nextMeeting, ...meetings];
    this.saveAll(next);
    return nextMeeting;
  },
  remove(id) {
    this.saveAll(this.list().filter((meeting) => meeting.id !== id));
  }
};

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeCallsign(callsign) {
  return callsign.trim().toUpperCase();
}

function initialMembers(defaultFeeManwon = 2) {
  return INITIAL_CALLSIGNS.map((callsign) => ({
    id: makeId("member"),
    callsign,
    name: "",
    attendance: true,
    fee_manwon: Number(defaultFeeManwon || 0),
    sponsor_manwon: 0,
    memo: ""
  }));
}

function copyMembersForNextMeeting(members, defaultFeeManwon = 2) {
  return members.map((member) => ({
    id: makeId("member"),
    callsign: normalizeCallsign(member.callsign),
    name: member.name || "",
    attendance: false,
    fee_manwon: Number(defaultFeeManwon || 0),
    sponsor_manwon: 0,
    memo: member.memo || ""
  }));
}

function calculateTotals(members) {
  const attendingMembers = members.filter((member) => member.attendance);
  return {
    total_people: attendingMembers.length,
    total_fee_manwon: attendingMembers.reduce((sum, member) => sum + Number(member.fee_manwon || 0), 0),
    total_sponsor_manwon: attendingMembers.reduce((sum, member) => sum + Number(member.sponsor_manwon || 0), 0)
  };
}

function enrichMeeting(meeting) {
  const totals = calculateTotals(meeting.members || []);
  return {
    ...meeting,
    members: meeting.members || [],
    ...totals,
    total_income_manwon: totals.total_fee_manwon + totals.total_sponsor_manwon
  };
}

function duplicateCallsigns(members) {
  const counts = new Map();
  members.forEach((member) => {
    const callsign = normalizeCallsign(member.callsign || "");
    if (!callsign) return;
    counts.set(callsign, (counts.get(callsign) || 0) + 1);
  });
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([callsign]) => callsign));
}

function manwon(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}만원`;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(meeting) {
  const summaryRows = [
    ["모임명", meeting.meeting_title],
    ["날짜", meeting.date],
    ["장소명", meeting.place_name],
    ["장소 주소", meeting.place_address],
    ["참석 인원", meeting.total_people],
    ["기본 회비(만원)", meeting.default_fee_manwon || 2],
    ["총 회비(만원)", meeting.total_fee_manwon],
    ["총 찬조금(만원)", meeting.total_sponsor_manwon],
    ["총 수입(만원)", meeting.total_income_manwon],
    []
  ];
  const memberRows = [
    ["callsign", "name", "attendance", "fee_manwon", "sponsor_manwon", "memo"],
    ...meeting.members.map((member) => [
      normalizeCallsign(member.callsign),
      member.name,
      member.attendance ? "참석" : "불참",
      member.fee_manwon,
      member.sponsor_manwon,
      member.memo
    ])
  ];
  const csv = [...summaryRows, ...memberRows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${meeting.date || "meeting"}_${meeting.meeting_title || "amateur-radio"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildTelegramReport(meeting) {
  const attendingMembers = meeting.members.filter((member) => member.attendance);
  const sponsors = attendingMembers.filter((member) => Number(member.sponsor_manwon || 0) > 0);
  const duplicateSet = duplicateCallsigns(meeting.members);
  const memberLines = attendingMembers.length > 0
    ? attendingMembers.map((member, index) => `${index + 1}. ${normalizeCallsign(member.callsign)} ${member.name || ""} / 회비 ${manwon(member.fee_manwon)} / 찬조 ${manwon(member.sponsor_manwon)}`)
    : ["참석자 없음"];
  const sponsorLines = sponsors.length > 0
    ? sponsors.map((member) => `- ${normalizeCallsign(member.callsign)} ${member.name || ""}: ${manwon(member.sponsor_manwon)}`)
    : ["찬조금 입력 내역 없음"];

  return [
    `[최종보고서] ${meeting.meeting_title || "아마추어무선 모임"}`,
    "",
    `날짜: ${meeting.date || "-"}`,
    `장소: ${meeting.place_name || "-"}`,
    `주소: ${meeting.place_address || "-"}`,
    `참석 인원: ${meeting.total_people || 0}명`,
    `기본 회비: ${manwon(meeting.default_fee_manwon || 2)}`,
    "",
    "[정산]",
    `총 회비: ${manwon(meeting.total_fee_manwon)}`,
    `총 찬조금: ${manwon(meeting.total_sponsor_manwon)}`,
    `총 수입: ${manwon(meeting.total_income_manwon)}`,
    "",
    "[중복 호출부호]",
    duplicateSet.size > 0 ? [...duplicateSet].join(", ") : "없음",
    "",
    "[참석자 명단]",
    ...memberLines,
    "",
    "[찬조 명단]",
    ...sponsorLines
  ].join("\n");
}

function shareTelegramReport(meeting) {
  const report = buildTelegramReport(meeting);
  const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(report)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function App() {
  const [meetings, setMeetings] = useState(() => meetingStore.list().map(enrichMeeting));
  const [route, setRoute] = useState({ name: "list" });
  const currentMeeting = meetings.find((meeting) => meeting.id === route.meetingId);

  function refresh(nextRoute = route) {
    setMeetings(meetingStore.list().map(enrichMeeting));
    setRoute(nextRoute);
  }

  function saveMeeting(meeting, nextRoute) {
    const saved = meetingStore.upsert(meeting);
    refresh(nextRoute || { name: "detail", meetingId: saved.id });
  }

  return (
    <main>
      {route.name === "list" && <MeetingList meetings={meetings} onNew={() => setRoute({ name: "new" })} onOpen={(id) => setRoute({ name: "detail", meetingId: id })} />}
      {route.name === "new" && <MeetingForm meetings={meetings} onCancel={() => setRoute({ name: "list" })} onSave={saveMeeting} />}
      {route.name === "detail" && currentMeeting && (
        <MeetingDetail
          meeting={currentMeeting}
          onBack={() => setRoute({ name: "list" })}
          onSave={saveMeeting}
          onEditMember={(memberId) => setRoute({ name: "member", meetingId: currentMeeting.id, memberId })}
          onAddMember={() => setRoute({ name: "member", meetingId: currentMeeting.id })}
          onSummary={() => setRoute({ name: "summary", meetingId: currentMeeting.id })}
          onDelete={() => {
            meetingStore.remove(currentMeeting.id);
            refresh({ name: "list" });
          }}
        />
      )}
      {route.name === "member" && currentMeeting && (
        <MemberForm
          meeting={currentMeeting}
          memberId={route.memberId}
          onCancel={() => setRoute({ name: "detail", meetingId: currentMeeting.id })}
          onSave={saveMeeting}
        />
      )}
      {route.name === "summary" && currentMeeting && <SummaryView meeting={currentMeeting} onBack={() => setRoute({ name: "detail", meetingId: currentMeeting.id })} />}
    </main>
  );
}

function Header({ meeting, onBack, actions }) {
  const duplicateSet = duplicateCallsigns(meeting.members);
  return (
    <section className="top-panel">
      <div className="top-actions">
        {onBack && (
          <button className="icon-button ghost" onClick={onBack} aria-label="뒤로">
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="action-row">{actions}</div>
      </div>
      <div className="title-block">
        <p className="eyebrow">아마추어무선 모임</p>
        <h1>{meeting.meeting_title || "새 모임"}</h1>
      </div>
      <div className="meta-grid">
        <Info icon={<CalendarDays size={18} />} label="날짜" value={meeting.date || "-"} />
        <Info icon={<MapPin size={18} />} label="장소" value={meeting.place_name || "-"} subValue={meeting.place_address} />
        <Info icon={<Users size={18} />} label="참석 인원" value={`${meeting.total_people || 0}명`} />
        <Info icon={<CircleDollarSign size={18} />} label="총액" value={manwon(meeting.total_income_manwon)} subValue={`회비 ${manwon(meeting.total_fee_manwon)} · 찬조 ${manwon(meeting.total_sponsor_manwon)}`} />
      </div>
      {duplicateSet.size > 0 && (
        <div className="warning">
          <AlertTriangle size={18} />
          중복 호출부호 감지: {[...duplicateSet].join(", ")}
        </div>
      )}
    </section>
  );
}

function Info({ icon, label, value, subValue }) {
  return (
    <div className="info">
      <div className="info-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {subValue && <small>{subValue}</small>}
      </div>
    </div>
  );
}

function MeetingList({ meetings, onNew, onOpen }) {
  return (
    <section className="page">
      <div className="list-head">
        <div>
          <p className="eyebrow">LocalStorage 저장</p>
          <h1>모임 목록</h1>
        </div>
        <button className="primary" onClick={onNew}>
          <Plus size={18} /> 새 모임
        </button>
      </div>
      {meetings.length === 0 ? (
        <div className="empty">
          <Users size={36} />
          <h2>아직 저장된 모임이 없습니다</h2>
          <p>새 모임을 만들면 초기 호출부호 명단이 자동으로 들어갑니다.</p>
          <button className="primary" onClick={onNew}>
            <Plus size={18} /> 새 모임 만들기
          </button>
        </div>
      ) : (
        <div className="meeting-list">
          {meetings.map((meeting) => (
            <button className="meeting-card" key={meeting.id} onClick={() => onOpen(meeting.id)}>
              <div>
                <h2>{meeting.meeting_title}</h2>
                <p>{meeting.date} · {meeting.place_name || "장소 미정"}</p>
              </div>
              <div className="card-totals">
                <strong>{manwon(meeting.total_income_manwon)}</strong>
                <span>{meeting.total_people}명 참석</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function MeetingForm({ meetings, onCancel, onSave }) {
  const latestMeetingId = meetings[0]?.id || "";
  const [form, setForm] = useState({
    meeting_title: "",
    date: today(),
    place_name: "",
    place_address: "",
    default_fee_manwon: 2,
    sourceMeetingId: latestMeetingId
  });

  function submit(event) {
    event.preventDefault();
    const source = meetings.find((meeting) => meeting.id === form.sourceMeetingId);
    const defaultFeeManwon = Number(form.default_fee_manwon || 0);
    const members = source ? copyMembersForNextMeeting(source.members, defaultFeeManwon) : initialMembers(defaultFeeManwon);
    onSave({
      id: makeId("meeting"),
      meeting_title: form.meeting_title.trim() || `${form.date} 모임`,
      date: form.date,
      place_name: form.place_name.trim(),
      place_address: form.place_address.trim(),
      default_fee_manwon: defaultFeeManwon,
      members
    });
  }

  return (
    <section className="page narrow">
      <div className="form-head">
        <button className="icon-button ghost" onClick={onCancel} aria-label="뒤로">
          <ArrowLeft size={20} />
        </button>
        <h1>새 모임 만들기</h1>
      </div>
      <form className="form" onSubmit={submit}>
        <label>
          모임명
          <input value={form.meeting_title} onChange={(event) => setForm({ ...form, meeting_title: event.target.value })} placeholder="예: 2026년 7월 정기 모임" />
        </label>
        <label>
          모임 날짜
          <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
        </label>
        <label>
          장소명
          <input value={form.place_name} onChange={(event) => setForm({ ...form, place_name: event.target.value })} placeholder="예: 대구 무선회관" />
        </label>
        <label>
          장소 주소
          <input value={form.place_address} onChange={(event) => setForm({ ...form, place_address: event.target.value })} placeholder="주소 입력" />
        </label>
        <label>
          기본 회비
          <div className="unit-input">
            <input type="number" min="0" step="1" value={form.default_fee_manwon} onChange={(event) => setForm({ ...form, default_fee_manwon: event.target.value })} />
            <span>만원</span>
          </div>
          <small>새 모임 참석자 회비 기본값입니다. 참석자 수정 화면에서 개인별 변경이 가능합니다.</small>
        </label>
        <label>
          참석자 명단 불러오기
          <select value={form.sourceMeetingId} onChange={(event) => setForm({ ...form, sourceMeetingId: event.target.value })}>
            <option value="">초기 호출부호 명단 사용</option>
            {meetings.map((meeting) => (
              <option value={meeting.id} key={meeting.id}>
                {meeting.date} · {meeting.meeting_title}
              </option>
            ))}
          </select>
          <small>기존 모임을 선택하면 호출부호와 이름을 가져오고 참석 여부는 새로 입력합니다. 회비는 기본 회비로 입력됩니다.</small>
        </label>
        <div className="button-row">
          <button type="button" className="secondary" onClick={onCancel}>취소</button>
          <button className="primary" type="submit"><Check size={18} /> 저장</button>
        </div>
      </form>
    </section>
  );
}

function MeetingDetail({ meeting, onBack, onSave, onEditMember, onAddMember, onSummary, onDelete }) {
  const [query, setQuery] = useState("");
  const duplicateSet = duplicateCallsigns(meeting.members);
  const filteredMembers = meeting.members.filter((member) => {
    const keyword = query.trim().toUpperCase();
    if (!keyword) return true;
    return normalizeCallsign(member.callsign).includes(keyword) || (member.name || "").toUpperCase().includes(keyword);
  });

  function toggleAttendance(member) {
    onSave({
      ...meeting,
      members: meeting.members.map((item) => item.id === member.id ? { ...item, attendance: !item.attendance } : item)
    }, { name: "detail", meetingId: meeting.id });
  }

  return (
    <>
      <Header
        meeting={meeting}
        onBack={onBack}
        actions={
          <>
            <button className="icon-button" onClick={onSummary} aria-label="정산 요약"><FileSpreadsheet size={19} /></button>
            <button className="icon-button" onClick={() => downloadCsv(meeting)} aria-label="CSV 저장"><Download size={19} /></button>
            <button className="icon-button danger" onClick={onDelete} aria-label="모임 삭제"><Trash2 size={19} /></button>
          </>
        }
      />
      <section className="content">
        <div className="toolbar">
          <div className="search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="호출부호 또는 이름 검색" />
          </div>
          <button className="primary" onClick={onAddMember}><Plus size={18} /> 참석자</button>
        </div>
        <div className="member-table">
          {filteredMembers.map((member) => {
            const isDuplicate = duplicateSet.has(normalizeCallsign(member.callsign));
            return (
              <div className={`member-row ${member.attendance ? "" : "muted"} ${isDuplicate ? "duplicate" : ""}`} key={member.id}>
                <button className={`toggle ${member.attendance ? "on" : ""}`} onClick={() => toggleAttendance(member)} aria-label="참석 여부 변경">
                  {member.attendance ? <Check size={16} /> : <X size={16} />}
                </button>
                <div className="member-main">
                  <strong>{normalizeCallsign(member.callsign) || "호출부호 없음"}</strong>
                  <span>{member.name || "이름 미입력"}</span>
                  {isDuplicate && <small className="duplicate-text">중복 호출부호</small>}
                </div>
                <div className="money-stack">
                  <span>회비 {manwon(member.fee_manwon)}</span>
                  <span>찬조 {manwon(member.sponsor_manwon)}</span>
                </div>
                <button className="icon-button ghost" onClick={() => onEditMember(member.id)} aria-label="참석자 수정">
                  <Edit3 size={18} />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function MemberForm({ meeting, memberId, onCancel, onSave }) {
  const existing = meeting.members.find((member) => member.id === memberId);
  const [member, setMember] = useState(existing || {
    id: makeId("member"),
    callsign: "",
    name: "",
    attendance: true,
    fee_manwon: Number(meeting.default_fee_manwon || 2),
    sponsor_manwon: 0,
    memo: ""
  });

  const duplicateSet = useMemo(() => duplicateCallsigns(meeting.members.filter((item) => item.id !== member.id).concat(member)), [meeting.members, member]);
  const isDuplicate = duplicateSet.has(normalizeCallsign(member.callsign || ""));

  function submit(event) {
    event.preventDefault();
    const normalized = {
      ...member,
      callsign: normalizeCallsign(member.callsign),
      fee_manwon: Number(member.fee_manwon || 0),
      sponsor_manwon: Number(member.sponsor_manwon || 0)
    };
    const exists = meeting.members.some((item) => item.id === normalized.id);
    onSave({
      ...meeting,
      members: exists ? meeting.members.map((item) => item.id === normalized.id ? normalized : item) : [...meeting.members, normalized]
    }, { name: "detail", meetingId: meeting.id });
  }

  function removeMember() {
    onSave({
      ...meeting,
      members: meeting.members.filter((item) => item.id !== member.id)
    }, { name: "detail", meetingId: meeting.id });
  }

  return (
    <section className="page narrow">
      <div className="form-head">
        <button className="icon-button ghost" onClick={onCancel} aria-label="뒤로">
          <ArrowLeft size={20} />
        </button>
        <h1>{existing ? "참석자 수정" : "참석자 추가"}</h1>
      </div>
      <form className="form" onSubmit={submit}>
        <label>
          호출부호
          <input value={member.callsign} onChange={(event) => setMember({ ...member, callsign: event.target.value.toUpperCase() })} required />
          {isDuplicate && <small className="error">같은 호출부호가 이미 있습니다.</small>}
        </label>
        <label>
          이름
          <input value={member.name} onChange={(event) => setMember({ ...member, name: event.target.value })} />
        </label>
        <label className="check-line">
          <input type="checkbox" checked={member.attendance} onChange={(event) => setMember({ ...member, attendance: event.target.checked })} />
          참석
        </label>
        <div className="two-col">
          <label>
            회비
            <div className="unit-input">
              <input type="number" min="0" step="1" value={member.fee_manwon} onChange={(event) => setMember({ ...member, fee_manwon: event.target.value })} />
              <span>만원</span>
            </div>
          </label>
          <label>
            찬조금
            <div className="unit-input">
              <input type="number" min="0" step="1" value={member.sponsor_manwon} onChange={(event) => setMember({ ...member, sponsor_manwon: event.target.value })} />
              <span>만원</span>
            </div>
          </label>
        </div>
        <label>
          메모
          <textarea rows="4" value={member.memo} onChange={(event) => setMember({ ...member, memo: event.target.value })} />
        </label>
        <div className="button-row">
          {existing && <button type="button" className="danger-button" onClick={removeMember}><Trash2 size={18} /> 삭제</button>}
          <button type="button" className="secondary" onClick={onCancel}>취소</button>
          <button className="primary" type="submit"><Check size={18} /> 저장</button>
        </div>
      </form>
    </section>
  );
}

function SummaryView({ meeting, onBack }) {
  const attendingMembers = meeting.members.filter((member) => member.attendance);
  const sponsors = attendingMembers.filter((member) => Number(member.sponsor_manwon || 0) > 0);
  return (
    <>
      <Header
        meeting={meeting}
        onBack={onBack}
        actions={<>
          <button className="telegram-button" onClick={() => shareTelegramReport(meeting)}><Send size={18} /> 텔레그램 보고</button>
          <button className="icon-button" onClick={() => downloadCsv(meeting)} aria-label="CSV 저장"><Download size={19} /></button>
        </>}
      />
      <section className="content summary-grid">
        <div className="summary-box">
          <span>총 회비</span>
          <strong>{manwon(meeting.total_fee_manwon)}</strong>
        </div>
        <div className="summary-box">
          <span>총 찬조금</span>
          <strong>{manwon(meeting.total_sponsor_manwon)}</strong>
        </div>
        <div className="summary-box accent">
          <span>총 수입</span>
          <strong>{manwon(meeting.total_income_manwon)}</strong>
        </div>
        <div className="summary-wide">
          <h2>참석자 {attendingMembers.length}명</h2>
          <div className="compact-list">
            {attendingMembers.map((member) => (
              <div key={member.id}>
                <strong>{normalizeCallsign(member.callsign)}</strong>
                <span>{member.name || "-"} · 회비 {manwon(member.fee_manwon)} · 찬조 {manwon(member.sponsor_manwon)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="summary-wide">
          <h2>찬조 명단</h2>
          <div className="compact-list">
            {sponsors.length === 0 ? <p className="subtle">찬조금 입력 내역이 없습니다.</p> : sponsors.map((member) => (
              <div key={member.id}>
                <strong>{normalizeCallsign(member.callsign)}</strong>
                <span>{member.name || "-"} · {manwon(member.sponsor_manwon)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
