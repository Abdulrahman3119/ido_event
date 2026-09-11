// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Session (List)

// --- IDO Session — Schedule Views ---
window.IDO_SCHED = function (stub, $b) {
	const CSS = `.ido-sch{max-width:1080px;margin:0 auto;direction:rtl;text-align:right}
.ido-sch .bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.ido-sch .seg{display:flex;background:var(--control-bg);border-radius:10px;padding:3px;gap:2px}
.ido-sch .seg button{border:0;background:transparent;color:var(--text-muted);padding:7px 15px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
.ido-sch .seg button.on{background:#5C2D91;color:#fff}
.ido-sch select{padding:7px 11px;border:1px solid var(--border-color);border-radius:8px;background:var(--control-bg);color:var(--text-color);font-size:13px}
.ido-sch .days{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.ido-sch .days a{padding:8px 16px;border-radius:999px;background:var(--control-bg);color:var(--text-muted);font-size:13px;font-weight:600;cursor:pointer}
.ido-sch .days a.on{background:#5C2D91;color:#fff}
.ido-sch .card{background:var(--card-bg);border:1px solid var(--border-color);border-radius:12px;padding:13px 15px;margin-bottom:9px;border-inline-start:4px solid #5C2D91}
.ido-sch .card .r{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.ido-sch .card b{font-size:15px}
.ido-sch .card .m{font-size:12px;color:var(--text-muted);margin-top:4px;line-height:1.7}
.ido-sch .pill{padding:2px 9px;border-radius:999px;font-size:11px;background:#E9E1F5;color:#5C2D91;white-space:nowrap}
.ido-sch .pill.g{background:#E3F5EC;color:#1F9D63}
.ido-sch .tl{display:grid;grid-template-columns:64px 1fr;gap:0}
.ido-sch .tl .h{border-top:1px dashed var(--border-color);padding:6px 0 18px;font-size:11px;color:var(--text-muted);text-align:center}
.ido-sch .tl .lane{border-top:1px dashed var(--border-color);min-height:52px}
.ido-sch .tlgrid{position:relative}
.ido-sch .tl .ev{z-index:3;overflow:hidden;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#7A4AB8,#45226D);color:#fff;border-radius:9px;padding:7px 11px;overflow:hidden;cursor:pointer;box-shadow:0 3px 10px rgba(69,34,109,.25)}
.ido-sch .tl .ev b{font-size:12.5px;display:block;line-height:1.35}
.ido-sch .tl .ev span{font-size:10.5px;opacity:.85}
.ido-sch .cal{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.ido-sch .cal .col{background:var(--card-bg);border:1px solid var(--border-color);border-radius:12px;overflow:hidden}
.ido-sch .cal .col h4{margin:0;padding:11px 14px;background:linear-gradient(135deg,#7A4AB8,#3B1A63);color:#fff;font-size:13.5px}
.ido-sch .cal .col .in{padding:9px}
.ido-sch .cal .slot{border-radius:9px;padding:8px 10px;margin-bottom:7px;background:var(--control-bg);cursor:pointer}
.ido-sch .cal .slot b{font-size:12.5px;display:block}
.ido-sch .cal .slot span{font-size:11px;color:var(--text-muted)}
.ido-sch .cal .slot.att{background:#E3F5EC}
.ido-sch .empty{text-align:center;padding:44px;color:var(--text-muted)}
.ido-sch .kpi{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.ido-sch .kpi div{background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;padding:8px 14px;font-size:12px;color:var(--text-muted)}
.ido-sch .kpi b{color:#5C2D91;font-size:17px;margin-inline-end:5px}
@media(max-width:860px){.ido-sch .cal{grid-template-columns:1fr}}`;
	frappe.dom.set_style(CSS);
	$b.addClass("ido-sch");

	const TYPE = { keynote:"كلمة رئيسية", panel:"جلسة حوارية", workshop:"ورشة", networking:"تواصل", ceremony:"حفل", break:"استراحة" };
	const TRACK = { investment:"الاستثمار", technology:"التقنية", policy:"السياسات", startups:"الشركات الناشئة", general:"عام" };
	let EVENT = localStorage.getItem("ido_sch_event") || "", EVENTS = [], VIEW = localStorage.getItem("ido_sch_view") || "agenda", DAY = null, TRK = "", TYP = "", GUEST = "", DATA = [], ATT = new Set();

	const hm = t => (t || "00:00:00").slice(0, 5);
	const mins = t => { const p = (t || "0:0").split(":"); return (+p[0]) * 60 + (+p[1]); };
	const esc = frappe.utils.escape_html;

	async function load() {
		if (!EVENT) { const evs = await frappe.db.get_list("IDO Event", { filters: { status: ["in",["Active","Draft","Completed"]] }, fields: ["name","event_name","event_name_ar"], limit: 20 });
			EVENTS = evs; for (const e of evs) { const c = await frappe.db.count("IDO Session", { filters: { event: e.name } }); if (c > 0) { EVENT = e.name; break; } }
			if (!EVENT && evs.length) EVENT = evs[0].name; }
		DATA = await frappe.db.get_list("IDO Session", { filters: EVENT ? { event: EVENT } : {},
			fields: ["name","title","title_ar","day","date","start_time","end_time","hall","venue","session_type","track","capacity","attendance_count","navigation_note"],
			order_by: "date asc, start_time asc", limit: 200 });
		if (GUEST) { const a = await frappe.db.get_list("IDO Attendance", { filters: { guest: GUEST }, fields: ["session"], limit: 200 }); ATT = new Set(a.map(x => x.session)); }
		else ATT = new Set();
		const days = [...new Set(DATA.map(s => s.day))].sort();
		if (DAY === null || !days.includes(DAY)) DAY = days[0] ?? null;
	}

	function filtered(day) { return DATA.filter(s => (day == null || s.day === day) && (!TRK || s.track === TRK) && (!TYP || s.session_type === TYP)); }

	async function render() {
		$b.html(`<div class="empty">${__("جارٍ التحميل…")}</div>`);
		await load();
		const days = [...new Set(DATA.map(s => s.day))].sort();
		const guests = await frappe.db.get_list("IDO Guest", { fields: ["name","full_name"], limit: 50 });
		$b.html(`
		<div class="bar">
			<div class="seg">
				<button data-v="agenda" class="${VIEW==="agenda"?"on":""}">${__("أجندة يومية")}</button>
				<button data-v="timeline" class="${VIEW==="timeline"?"on":""}">${__("Timeline")}</button>
				<button data-v="calendar" class="${VIEW==="calendar"?"on":""}">${__("Calendar")}</button>
			</div>
			<select class="f-event">${EVENTS.map(e=>`<option value="${esc(e.name)}" ${EVENT===e.name?"selected":""}>${esc(e.event_name_ar||e.event_name||e.name)}</option>`).join("")}</select>
			<select class="f-track"><option value="">${__("كل المسارات")}</option>${Object.entries(TRACK).map(([k,v])=>`<option value="${k}" ${TRK===k?"selected":""}>${v}</option>`).join("")}</select>
			<select class="f-type"><option value="">${__("كل الأنواع")}</option>${Object.entries(TYPE).map(([k,v])=>`<option value="${k}" ${TYP===k?"selected":""}>${v}</option>`).join("")}</select>
			<select class="f-guest"><option value="">${__("جدول عام")}</option>${guests.map(g=>`<option value="${esc(g.name)}" ${GUEST===g.name?"selected":""}>${esc(g.full_name||g.name)}</option>`).join("")}</select>
		</div>
		<div class="kpi"><div><b>${DATA.length}</b>${__("جلسة")}</div><div><b>${days.length}</b>${__("أيام")}</div>
			<div><b>${[...new Set(DATA.map(s=>s.hall).filter(Boolean))].length}</b>${__("قاعات")}</div>
			${GUEST?`<div><b>${ATT.size}</b>${__("حضرها الضيف")}</div>`:""}</div>
		${VIEW!=="calendar"?`<div class="days">${days.map(d=>`<a data-d="${d}" class="${DAY===d?"on":""}">${__("اليوم")} ${d}</a>`).join("")}</div>`:""}
		<div id="sv"></div>`);
		$b.find(".seg button").on("click", function () { VIEW = $(this).data("v"); localStorage.setItem("ido_sch_view", VIEW); render(); });
		$b.find(".f-event").on("change", function () { EVENT = this.value; localStorage.setItem("ido_sch_event", EVENT); DAY = null; render(); });
		$b.find(".f-track").on("change", function () { TRK = this.value; render(); });
		$b.find(".f-type").on("change", function () { TYP = this.value; render(); });
		$b.find(".f-guest").on("change", function () { GUEST = this.value; render(); });
		$b.find(".days a").on("click", function () { DAY = $(this).data("d"); render(); });
		({ agenda, timeline, calendar }[VIEW])($b.find("#sv"));
	}

	function card(s) {
		const att = ATT.has(s.name);
		return `<div class="card" data-n="${esc(s.name)}">
			<div class="r"><div><b>${esc(s.title_ar || s.title)}</b>
				<div class="m">${hm(s.start_time)} – ${hm(s.end_time)}${s.hall?` · ${esc(s.hall)}`:""}${s.navigation_note?` · ${esc(s.navigation_note)}`:""}</div>
				<div class="m">${TYPE[s.session_type]||s.session_type} · ${TRACK[s.track]||s.track||""} · ${__("الحضور")}: ${s.attendance_count||0}${s.capacity?" / "+s.capacity:""}</div></div>
			<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
				${att?`<span class="pill g">${__("حضرها")}</span>`:`<span class="pill">${TYPE[s.session_type]||""}</span>`}
				<button class="btn btn-xs act-open">${__("فتح")}</button></div></div></div>`;
	}
	function bind($v) { $v.find(".act-open").on("click", function () { frappe.set_route("Form", "IDO Session", $(this).closest("[data-n]").data("n")); });
		$v.find(".ev,.slot").on("click", function () { frappe.set_route("Form", "IDO Session", $(this).data("n")); }); }

	function agenda($v) { const rows = filtered(DAY);
		$v.html(rows.length ? rows.map(card).join("") : `<div class="empty">${__("لا جلسات مطابقة للفلاتر")}</div>`); bind($v); }

	function timeline($v) { const rows = filtered(DAY);
		if (!rows.length) return $v.removeClass("tl").html(`<div class="empty">${__("لا جلسات في هذا اليوم")}</div>`);
		const halls = [...new Set(rows.map(s => s.hall || "—"))];
		const h0 = Math.floor(Math.min(...rows.map(s => mins(s.start_time))) / 60);
		const h1 = Math.ceil(Math.max(...rows.map(s => mins(s.end_time))) / 60);
		const SLOT = 15, nSlots = (h1 - h0) * (60 / SLOT), SH = 22;
		const slotOf = t => Math.round((mins(t) - h0 * 60) / SLOT);
		let g = `<div style="overflow-x:auto"><div style="display:grid;grid-template-columns:58px repeat(${halls.length},minmax(190px,1fr));gap:5px;min-width:${58 + halls.length * 195}px">
			<div></div>${halls.map(h => `<div style="text-align:center;font-size:12px;font-weight:700;color:#5C2D91;padding:6px 0">${esc(h)}</div>`).join("")}
			<div style="display:grid;grid-template-rows:repeat(${nSlots},${SH}px)">`;
		for (let i = 0; i < nSlots; i++) { const m = h0 * 60 + i * SLOT;
			g += `<div style="font-size:10.5px;color:var(--text-muted);text-align:center;${m % 60 === 0 ? "border-top:1px solid var(--border-color)" : ""}">${m % 60 === 0 ? String(Math.floor(m/60)).padStart(2,"0") + ":00" : ""}</div>`; }
		g += `</div>`;
		halls.forEach(h => {
			g += `<div style="display:grid;grid-template-rows:repeat(${nSlots},${SH}px);gap:0;position:relative">`;
			for (let i = 0; i < nSlots; i++) g += `<div style="${(h0*60+i*SLOT) % 60 === 0 ? "border-top:1px dashed var(--border-color)" : ""}"></div>`;
			rows.filter(s => (s.hall || "—") === h).forEach(s => { const r1 = slotOf(s.start_time) + 1, r2 = Math.max(r1 + 1, slotOf(s.end_time) + 1);
				g += `<div class="ev" data-n="${esc(s.name)}" style="grid-row:${r1} / ${r2};grid-column:1;margin:1px 2px;position:relative">
					<b>${esc(s.title_ar || s.title)}</b><span>${hm(s.start_time)}–${hm(s.end_time)}</span></div>`; });
			g += `</div>`; });
		g += `</div></div>`;
		$v.addClass("tl").html(g); bind($v);
	}

	function calendar($v) { const days = [...new Set(DATA.map(s => s.day))].sort();
		const rows = filtered(null);
		$v.removeClass("tl").html(`<div class="cal">${days.map(d => { const ds = rows.filter(s => s.day === d);
			const date = ds[0] ? frappe.datetime.str_to_user(ds[0].date) : "";
			return `<div class="col"><h4>${__("اليوم")} ${d} · ${date} <span style="opacity:.75;font-size:11px">(${ds.length})</span></h4><div class="in">
			${ds.length ? ds.map(s=>`<div class="slot ${ATT.has(s.name)?"att":""}" data-n="${esc(s.name)}"><b>${esc(s.title_ar||s.title)}</b>
				<span>${hm(s.start_time)}–${hm(s.end_time)}${s.hall?" · "+esc(s.hall):""}</span></div>`).join("") : `<div class="empty" style="padding:20px;font-size:12px">${__("لا جلسات")}</div>`}
			</div></div>`; }).join("")}</div>`);
		bind($v);
	}
	render();
};

frappe.listview_settings = frappe.listview_settings || {};
frappe.listview_settings["IDO Session"] = Object.assign(frappe.listview_settings["IDO Session"] || {}, {
	onload(listview) {
		const KEY = "ido_sched_open"; const $page = listview.page.wrapper; let $shell = null, on = false;
		function mount() { on = true; localStorage.setItem(KEY, "1");
			$page.find(".layout-main-section > *").not(".ido-sched-shell").hide();
			$page.find(".layout-side-section").hide();
			if (!$shell) $shell = $('<div class="ido-sched-shell"></div>').appendTo($page.find(".layout-main-section"));
			$shell.show().empty();
			const $exit = $(`<div style="margin-bottom:10px"><button class="btn btn-default btn-sm">${__("عرض القائمة")}</button></div>`).appendTo($shell);
			$exit.find("button").on("click", unmount);
			window.IDO_SCHED({}, $('<div></div>').appendTo($shell));
			listview.page.set_title(__("جدول الفعالية"));
		}
		function unmount() { on = false; localStorage.removeItem(KEY); $page.find(".ido-sched-shell").hide();
			$page.find(".layout-main-section > *").not(".ido-sched-shell").show(); $page.find(".layout-side-section").show();
			listview.page.set_title(__("IDO Session")); }
		listview.page.add_inner_button(__("جدول الفعالية"), () => on ? unmount() : mount()).addClass("btn-primary");
		if (localStorage.getItem(KEY) === "1") setTimeout(mount, 300);
	}
});
