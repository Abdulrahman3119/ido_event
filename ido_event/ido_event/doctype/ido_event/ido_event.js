// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Event (Form)

// --- IDO Event — Agenda ---
window.IDO_AGENDA = {
	L: {
		ar: { day:"اليوم", time:"الوقت", session:"الجلسة", hall:"القاعة", track:"المسار",
			agenda:"جدول الأعمال", noSessions:"لم تُضف جلسات لهذا اليوم بعد", greeting:"عزيزي/عزيزتي",
			intro:"يسرّنا مشاركتك جدول أعمال الفعالية. تجد أدناه البرنامج مقسّمًا حسب الأيام.",
			footer:"نتطلع لحضورك.", portal:"بوابة الضيف", preDay:"اليوم التمهيدي" },
		en: { day:"Day", time:"Time", session:"Session", hall:"Hall", track:"Track",
			agenda:"Agenda", noSessions:"No sessions scheduled for this day yet", greeting:"Dear",
			intro:"Here is the full programme, organised day by day.",
			footer:"We look forward to welcoming you.", portal:"Guest Portal", preDay:"Day -1" }
	},
	TYPE: { keynote:["كلمة رئيسية","Keynote"], panel:["جلسة حوارية","Panel"], workshop:["ورشة عمل","Workshop"],
		networking:["لقاء تواصل","Networking"], ceremony:["حفل","Ceremony"], break:["استراحة","Break"],
		plenary:["جلسة عامة","Plenary"], bilateral:["اجتماع ثنائي","Bilateral"], site_visit:["زيارة ميدانية","Site Visit"],
		gala:["حفل عشاء","Gala"], group_photo:["صورة جماعية","Group Photo"] },
	hm(t) { const p = String(t || "0:0").split(":"); return String(p[0] || "0").padStart(2, "0") + ":" + String(p[1] || "00").padStart(2, "0"); },
	secLabel(sec, lang) { return lang === "ar" ? (sec.section_title_ar || sec.section_title) : (sec.section_title || sec.section_title_ar); },
	groupBySection(sessions, sections, dayNo) {
		const rows = sessions.filter(s => String(s.day) === String(dayNo));
		const secs = (sections || []).filter(x => String(x.event_day) === String(dayNo));
		if (!secs.length) return [{ sec: null, rows: rows }];
		const mins = v => { const p = String(v || "0:0").split(":"); return (+p[0]) * 60 + (+(p[1] || 0)); };
		const out = secs.slice().sort((a, b) => mins(a.start_time) - mins(b.start_time)).map(sec => ({ sec: sec, rows: [] }));
		const loose = [];
		rows.forEach(function (r) {
			const byName = r.agenda_section ? out.find(o => (o.sec.section_title || "") === r.agenda_section || (o.sec.section_title_ar || "") === r.agenda_section) : null;
			if (byName) return byName.rows.push(r);
			const t = mins(r.start_time);
			const byTime = out.find(o => o.sec.start_time && o.sec.end_time && t >= mins(o.sec.start_time) && t < mins(o.sec.end_time));
			if (byTime) return byTime.rows.push(r);
			loose.push(r);
		});
		if (loose.length) out.push({ sec: null, rows: loose });
		return out.filter(o => o.rows.length || o.sec);
	},
	async load(eventName) {
		const ev = await frappe.db.get_doc("IDO Event", eventName);
		const sessions = await frappe.db.get_list("IDO Session", { filters: { event: eventName },
			fields: ["name","title","title_ar","day","date","start_time","end_time","hall","navigation_note","session_type","track"],
			order_by: "date asc, start_time asc", limit: 300 });
		const days = (ev.days || []).slice().sort((a,b) => (a.day_no||0)-(b.day_no||0));
		const sections = (ev.agenda_sections || []).slice().sort((a,b) => ((a.event_day||0)-(b.event_day||0)) || ((a.start_time||"").split(":")[0]*60+ +((a.start_time||"0:0").split(":")[1]||0)) - ((b.start_time||"").split(":")[0]*60+ +((b.start_time||"0:0").split(":")[1]||0)));
		return { ev, sessions, days, sections };
	},
	build(data, opts) {
		opts = opts || {};
		const ev = data.ev, sessions = data.sessions, days = data.days;
		const lang = opts.lang || "ar";
		const L = this.L[lang] || this.L.ar;
		const rtl = lang === "ar";
		const accent = ev.agenda_accent_color || "#5C2D91";
		const layout = opts.layout || ev.agenda_layout || "day_tables";
		const showHall = ev.agenda_show_hall !== 0;
		const showTrack = ev.agenda_show_track !== 0;
		const esc = s => frappe.utils.escape_html(String(s == null ? "" : s));
		const title = lang === "ar" ? (ev.event_name_ar || ev.event_name) : (ev.event_name || ev.event_name_ar);
		const align = rtl ? "right" : "left";
		const cols = [L.time, L.session];
		if (showHall) cols.push(L.hall);
		if (showTrack) cols.push(L.track);
		const self = this;
		const dayTable = function(d) {
			const groups = self.groupBySection(sessions, data.sections, d.day_no);
			const total = sessions.filter(s => String(s.day) === String(d.day_no)).length;
			const label = d.is_pre_day ? L.preDay : L.day + " " + d.day_no;
			const dateTxt = d.date ? frappe.datetime.str_to_user(d.date) : "";
			const head = "<tr>" + cols.map(c => '<th style="background:' + accent + ';color:#fff;padding:8px 12px;text-align:' + align + ';font-size:11.5px;font-weight:700">' + esc(c) + "</th>").join("") + "</tr>";
			const rowHtml = function(s, i) {
				const bg = i % 2 ? "#faf8fc" : "#ffffff";
				const t = self.TYPE[s.session_type] ? self.TYPE[s.session_type][rtl ? 0 : 1] : (s.session_type || "");
				const nm = lang === "ar" ? (s.title_ar || s.title) : (s.title || s.title_ar);
				let tds = '<td style="background:' + bg + ';padding:9px 12px;font-size:12.5px;white-space:nowrap;color:#45226d;font-weight:600">' + self.hm(s.start_time) + " – " + self.hm(s.end_time) + "</td>";
				tds += '<td style="background:' + bg + ';padding:9px 12px;font-size:13px"><b>' + esc(nm) + "</b>" + (t ? '<div style="font-size:11px;color:#777;margin-top:2px">' + esc(t) + "</div>" : "") + "</td>";
				if (showHall) tds += '<td style="background:' + bg + ';padding:9px 12px;font-size:12px;color:#555">' + esc(s.hall || "—") + (s.navigation_note ? '<div style="font-size:10.5px;color:#999">' + esc(s.navigation_note) + "</div>" : "") + "</td>";
				if (showTrack) tds += '<td style="background:' + bg + ';padding:9px 12px;font-size:12px;color:#555">' + esc(s.track || "—") + "</td>";
				return "<tr>" + tds + "</tr>";
			};
			let inner2 = "";
			groups.forEach(function(g) {
				if (g.sec) {
					const st = self.secLabel(g.sec, lang);
					const range = (g.sec.start_time && g.sec.end_time) ? self.hm(g.sec.start_time) + "–" + self.hm(g.sec.end_time) : "";
					inner2 += '<tr><td colspan="' + cols.length + '" style="background:#efe8f8;padding:7px 12px;font-size:12px;font-weight:700;color:#3B1A63;border-top:1px solid #e0d3ef">'
						+ esc(st || "") + (range ? ' <span style="font-weight:500;color:#7a6f92">· ' + range + "</span>" : "")
						+ (g.sec.hall ? ' <span style="font-weight:500;color:#7a6f92">· ' + esc(g.sec.hall) + "</span>" : "") + "</td></tr>";
				}
				inner2 += g.rows.length ? g.rows.map(rowHtml).join("")
					: '<tr><td colspan="' + cols.length + '" style="padding:10px;text-align:center;color:#bbb;font-size:11.5px">' + esc(L.noSessions) + "</td></tr>";
			});
			if (!groups.length) inner2 = '<tr><td colspan="' + cols.length + '" style="padding:16px;text-align:center;color:#999;font-size:12.5px">' + esc(L.noSessions) + "</td></tr>";
			return '<div style="margin:0 0 22px"><div style="background:linear-gradient(135deg,' + accent + ',#3B1A63);color:#fff;padding:10px 14px;border-radius:10px 10px 0 0;font-size:14px;font-weight:700">'
				+ esc(label) + (dateTxt ? " · " + esc(dateTxt) : "") + ((d.title || d.title_ar) ? " — " + esc(lang === "ar" ? (d.title_ar || d.title) : (d.title || d.title_ar)) : "")
				+ '<span style="float:' + (rtl ? "left" : "right") + ';font-weight:500;opacity:.85;font-size:12px">' + total + "</span></div>"
				+ '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border:1px solid #e6ddf0;border-top:0">' + head + inner2 + "</table></div>";
		};

		let inner;
		if (layout === "compact_list") {
			inner = days.map(function(d) {
				const rows = sessions.filter(s => String(s.day) === String(d.day_no));
				const label = d.is_pre_day ? L.preDay : L.day + " " + d.day_no;
				return '<div style="margin-bottom:16px"><div style="color:' + accent + ';font-weight:700;font-size:13.5px;margin-bottom:6px;border-bottom:2px solid ' + accent + ';padding-bottom:4px">' + esc(label) + (d.date ? " · " + esc(frappe.datetime.str_to_user(d.date)) : "") + "</div>"
					+ (rows.length ? rows.map(s => '<div style="padding:6px 0;border-bottom:1px dotted #e6ddf0;font-size:12.5px"><b style="color:#45226d">' + self.hm(s.start_time) + "–" + self.hm(s.end_time) + "</b> &nbsp; " + esc(lang === "ar" ? (s.title_ar || s.title) : (s.title || s.title_ar)) + (showHall && s.hall ? '<span style="color:#888;font-size:11px"> · ' + esc(s.hall) + "</span>" : "") + "</div>").join("")
					: '<div style="color:#999;font-size:12px;padding:6px 0">' + esc(L.noSessions) + "</div>") + "</div>";
			}).join("");
		} else if (layout === "single_table") {
			const head = "<tr>" + [L.day].concat(cols).map(c => '<th style="background:' + accent + ';color:#fff;padding:9px 12px;text-align:' + align + ';font-size:12px">' + esc(c) + "</th>").join("") + "</tr>";
			const body = sessions.map(function(s, i) {
				const bg = i % 2 ? "#faf8fc" : "#fff";
				let tds = '<td style="background:' + bg + ';padding:8px 12px;font-size:12px">' + L.day + " " + (s.day || "-") + "</td>";
				tds += '<td style="background:' + bg + ';padding:8px 12px;font-size:12px;white-space:nowrap">' + self.hm(s.start_time) + "–" + self.hm(s.end_time) + "</td>";
				tds += '<td style="background:' + bg + ';padding:8px 12px;font-size:12.5px"><b>' + esc(lang === "ar" ? (s.title_ar || s.title) : (s.title || s.title_ar)) + "</b></td>";
				if (showHall) tds += '<td style="background:' + bg + ';padding:8px 12px;font-size:12px">' + esc(s.hall || "—") + "</td>";
				if (showTrack) tds += '<td style="background:' + bg + ';padding:8px 12px;font-size:12px">' + esc(s.track || "—") + "</td>";
				return "<tr>" + tds + "</tr>";
			}).join("");
			inner = '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border:1px solid #e6ddf0">' + head + body + "</table>";
		} else { inner = days.map(dayTable).join(""); }
		const intro = lang === "ar" ? (ev.agenda_intro_ar || L.intro) : (ev.agenda_intro_en || L.intro);
		const dates = (ev.start_date ? frappe.datetime.str_to_user(ev.start_date) : "") + " → " + (ev.end_date ? frappe.datetime.str_to_user(ev.end_date) : "");
		return '<div dir="' + (rtl ? "rtl" : "ltr") + '" style="font-family:Tahoma,Arial,sans-serif;max-width:640px;margin:0 auto;color:#231f20;text-align:' + align + '">'
			+ '<div style="background:linear-gradient(140deg,#25255a,' + accent + ' 55%,#7f529e);color:#fff;padding:26px 24px;border-radius:16px 16px 0 0">'
			+ '<div style="font-size:12px;opacity:.85;letter-spacing:1px">' + esc(L.agenda) + "</div>"
			+ '<div style="font-size:22px;font-weight:800;margin-top:4px">' + esc(title) + "</div>"
			+ '<div style="font-size:12.5px;opacity:.9;margin-top:6px">' + esc(dates) + (ev.venue ? " · " + esc(ev.venue) : "") + "</div></div>"
			+ '<div style="border:1px solid #e6ddf0;border-top:0;border-radius:0 0 16px 16px;padding:22px 20px;background:#fff">'
			+ (opts.guestName ? '<p style="margin:0 0 8px;font-size:14px">' + esc(L.greeting) + " " + esc(opts.guestName) + ",</p>" : "")
			+ '<p style="margin:0 0 18px;font-size:13.5px;color:#555;line-height:1.8">' + esc(intro) + "</p>" + inner
			+ '<p style="margin:18px 0 0;font-size:13px;color:#555">' + esc(L.footer) + "</p>"
			+ (opts.portalUrl ? '<p style="margin-top:14px"><a href="' + opts.portalUrl + '" style="background:' + accent + ';color:#fff;padding:11px 24px;border-radius:999px;text-decoration:none;font-size:13px;display:inline-block">' + esc(L.portal) + "</a></p>" : "")
			+ '</div><div style="text-align:center;padding:14px;font-size:11px;color:#999">i-do Events · ' + esc(title) + "</div></div>";
	},
	// ---- PDF: build print-ready HTML and hand it to Frappe's PDF engine ----
	pdfHtml(data, lang) {
		const body = this.build(data, { lang: lang });
		return '<!DOCTYPE html><html dir="' + (lang === "ar" ? "rtl" : "ltr") + '"><head><meta charset="utf-8">'
			+ '<style>@page{size:A4;margin:14mm 12mm}body{margin:0;font-family:Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
			+ 'table{page-break-inside:auto}tr{page-break-inside:avoid}div[style*="margin:0 0 22px"]{page-break-inside:avoid}</style></head><body>'
			+ body + "</body></html>";
	},
	async pdfUrl(eventName, lang) {
		const data = await this.load(eventName);
		if (!lang || lang === "guest_language") lang = (data.ev.agenda_language && data.ev.agenda_language !== "guest_language") ? data.ev.agenda_language : "ar";
		const html = this.pdfHtml(data, lang);
		return "/api/method/frappe.utils.print_format.report_to_pdf?html=" + encodeURIComponent(html)
			+ "&orientation=Portrait&_lang=" + encodeURIComponent(lang);
	},
	async downloadPdf(eventName, lang) {
		const data = await this.load(eventName);
		if (!lang || lang === "guest_language") lang = (data.ev.agenda_language && data.ev.agenda_language !== "guest_language") ? data.ev.agenda_language : "ar";
		const html = this.pdfHtml(data, lang);
		const f = document.createElement("form");
		f.method = "POST"; f.action = "/api/method/frappe.utils.print_format.report_to_pdf"; f.target = "_blank";
		const add = (k, v) => { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; f.appendChild(i); };
		add("html", html); add("orientation", "Portrait"); add("cmd", "frappe.utils.print_format.report_to_pdf");
		if (frappe.csrf_token) add("csrf_token", frappe.csrf_token);
		document.body.appendChild(f); f.submit(); setTimeout(() => f.remove(), 3000);
	},
	async sendPdfTo(eventName, guestName) {
		const data = await this.load(eventName);
		if (data.ev.show_agenda === 0) throw new Error("agenda hidden");
		const g = await frappe.db.get_doc("IDO Guest", guestName);
		if (!g.email) throw new Error("no email");
		let lang = data.ev.agenda_language || "guest_language";
		if (lang === "guest_language") lang = (g.language === "en" || g.language === "fr") ? "en" : "ar";
		const html = this.pdfHtml(data, lang);
		const title = lang === "ar" ? (data.ev.event_name_ar || data.ev.event_name) : (data.ev.event_name || data.ev.event_name_ar);
		// report_to_pdf streams a real PDF file — fetch it and store as an attachment
		const resp = await fetch("/api/method/frappe.utils.print_format.report_to_pdf", { method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Frappe-CSRF-Token": frappe.csrf_token || "" },
			body: new URLSearchParams({ html: html, orientation: "Portrait" }).toString() });
		if (!resp.ok) throw new Error("PDF generation failed (" + resp.status + ")");
		const buf = await resp.arrayBuffer();
		let bin = ""; const bytes = new Uint8Array(buf);
		for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
		const b64 = btoa(bin);
		const fname = "Agenda-" + String(eventName).replace(/[^A-Za-z0-9_-]/g, "") + "-" + lang + ".pdf";
		const f = await frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "File", file_name: fname,
			attached_to_doctype: "IDO Guest", attached_to_name: guestName, is_private: 1, content: b64, decode: 1 } } });
		const fileUrl = f.message && f.message.file_url;
		const cover = lang === "ar"
			? '<div dir="rtl" style="font-family:Tahoma,sans-serif"><p>عزيزي/عزيزتي ' + frappe.utils.escape_html(g.first_name || "") + '،</p><p>تجد مرفقًا جدول أعمال <b>' + frappe.utils.escape_html(title) + '</b> بصيغة PDF.</p><p>نتطلع لحضورك.</p></div>'
			: '<div style="font-family:Arial,sans-serif"><p>Dear ' + frappe.utils.escape_html(g.first_name || "") + ',</p><p>Please find attached the agenda for <b>' + frappe.utils.escape_html(title) + '</b> as a PDF.</p><p>We look forward to welcoming you.</p></div>';
		const subj = lang === "ar" ? ("جدول أعمال " + title + " (PDF)") : ("Agenda — " + title + " (PDF)");
		const args = { recipients: g.email, doctype: "IDO Guest", name: guestName, subject: subj, content: cover, send_email: 1 };
		if (fileUrl) args.attachments = JSON.stringify([{ file_url: fileUrl }]);
		await frappe.call({ method: "frappe.core.doctype.communication.email.make", args: args });
		return g.email;
	},
	async sendTo(eventName, guestName) {
		const data = await this.load(eventName);
		if (data.ev.show_agenda === 0) throw new Error("agenda hidden");
		const g = await frappe.db.get_doc("IDO Guest", guestName);
		if (!g.email) throw new Error("no email");
		let lang = data.ev.agenda_language || "guest_language";
		if (lang === "guest_language") lang = (g.language === "en" || g.language === "fr") ? "en" : "ar";
		const html = this.build(data, { lang: lang, guestName: g.first_name || g.full_name, portalUrl: location.origin + "/guest" });
		const subj = lang === "ar" ? ("جدول أعمال " + (data.ev.event_name_ar || data.ev.event_name)) : ("Agenda — " + (data.ev.event_name || data.ev.event_name_ar));
		await frappe.call({ method: "frappe.core.doctype.communication.email.make",
			args: { recipients: g.email, doctype: "IDO Guest", name: guestName, subject: subj, content: html, send_email: 1 } });
		return g.email;
	}
};

frappe.ui.form.on("IDO Event", {
	refresh(frm) {
		if (frm.is_new()) return;
		if (frm.doc.show_agenda === 0) frm.dashboard.add_comment(__("Agenda is hidden for this event"), "orange", true);
		frm.add_custom_button(__("Preview Agenda Email"), async () => {
			const data = await window.IDO_AGENDA.load(frm.doc.name);
			let lang = frm.doc.agenda_language;
			if (!lang || lang === "guest_language") lang = (frappe.boot.lang === "en" ? "en" : "ar");
			const html = window.IDO_AGENDA.build(data, { lang: lang, guestName: "\u2014", portalUrl: location.origin + "/guest" });
			const d = new frappe.ui.Dialog({ title: __("Agenda Email Preview"), size: "large" });
			d.$wrapper.find(".modal-dialog").css("max-width", "780px");
			$(html).appendTo(d.body); d.show();
		}, __("Agenda"));
		frm.add_custom_button(__("Send Agenda to All Registered"), () => {
			frappe.confirm(__("Send the agenda email to every registered guest of this event?"), async () => {
				const gs = await frappe.db.get_list("IDO Guest", { filters: { event: frm.doc.name, email: ["is","set"] }, fields: ["name"], limit: 500 });
				if (!gs.length) return frappe.msgprint(__("No guests with an email address."));
				let ok = 0, err = 0;
				frappe.show_alert({ message: __("Sending to {0} guests\u2026", [gs.length]), indicator: "blue" });
				for (const g of gs) { try { await window.IDO_AGENDA.sendTo(frm.doc.name, g.name); ok++; } catch (e) { err++; } }
				frappe.msgprint({ title: __("Agenda sent"), indicator: ok ? "green" : "red", message: __("Sent: {0} \u00b7 Failed: {1}", [ok, err]) });
			});
		}, __("Agenda"));
		frm.add_custom_button(__("Download Agenda PDF"), async () => {
			frappe.show_alert({ message: __("Generating PDF…"), indicator: "blue" });
			try { await window.IDO_AGENDA.downloadPdf(frm.doc.name, frm.doc.agenda_language); }
			catch (e) { frappe.msgprint({ message: __("Could not generate the PDF: {0}", [String(e.message || e).slice(0,120)]), indicator: "red" }); }
		}, __("Agenda"));
		frm.add_custom_button(__("Send Agenda PDF to All"), () => {
			frappe.confirm(__("Email the agenda as a PDF attachment to every registered guest?"), async () => {
				const gs = await frappe.db.get_list("IDO Guest", { filters: { event: frm.doc.name, email: ["is","set"] }, fields: ["name"], limit: 500 });
				if (!gs.length) return frappe.msgprint(__("No guests with an email address."));
				let ok = 0, err = 0, lastErr = "";
				frappe.show_alert({ message: __("Sending to {0} guests…", [gs.length]), indicator: "blue" });
				for (const g of gs) { try { await window.IDO_AGENDA.sendPdfTo(frm.doc.name, g.name); ok++; } catch (e) { err++; lastErr = String(e.message || e).slice(0,90); } }
				frappe.msgprint({ title: __("Agenda PDF sent"), indicator: ok ? "green" : "red",
					message: __("Sent: {0} · Failed: {1}", [ok, err]) + (lastErr ? "<br><small>" + frappe.utils.escape_html(lastErr) + "</small>" : "") });
			});
		}, __("Agenda"));
		frm.add_custom_button(__("Open Schedule"), () => frappe.set_route("List","IDO Session",{event:frm.doc.name}), __("Agenda"));
		frm.add_custom_button(__("خطة الفعالية"), () => idoShowEventPlan(frm), __("Agenda"));
		frm.add_custom_button(__("إضافة جلسة"), () => idoAddSessionPrompt(frm), __("Agenda"));
		backfillDays(frm);
		fillDayOptions(frm);
		setTimeout(function(){ relabelDaySelects(frm); }, 600);
		renderDayAgenda(frm);
	},
});
async function renderDayAgenda(frm) {
	const wrap = frm.get_field("agenda_html");
	if (!wrap) return;
	if (frm.doc.show_agenda === 0) { wrap.$wrapper.html('<div style="padding:22px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px">' + __("Agenda is hidden for this event") + "</div>"); return; }
	const data = await window.IDO_AGENDA.load(frm.doc.name);
	const lang = frappe.boot.lang === "en" ? "en" : "ar";
	const L = window.IDO_AGENDA.L[lang];
	const esc = s => frappe.utils.escape_html(String(s == null ? "" : s));
	const hm = t => window.IDO_AGENDA.hm(t);
	const TYPE = window.IDO_AGENDA.TYPE;
	const rtl = lang === "ar";
	if (!data.days.length) { wrap.$wrapper.html('<div style="padding:20px;text-align:center;color:var(--text-muted)">' + __("Add event days first") + "</div>"); return; }

	const total = data.sessions.length;
	let html = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">'
		+ '<span style="background:#efe8f8;color:#3B1A63;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700">' + total + " " + __("sessions") + "</span>"
		+ '<span style="background:#efe8f8;color:#3B1A63;padding:5px 12px;border-radius:999px;font-size:12px">' + data.days.length + " " + __("days") + "</span>"
		+ '<button class="btn btn-xs btn-default ido-refresh-agenda">↻ ' + __("Refresh") + "</button></div>";

	data.days.forEach(function (d) {
		const groups = window.IDO_AGENDA.groupBySection(data.sessions, data.sections, d.day_no);
		const dayRows = data.sessions.filter(s => String(s.day) === String(d.day_no));
		const label = d.is_pre_day ? L.preDay : L.day + " " + d.day_no;
		html += '<div style="margin-bottom:14px;border:1px solid var(--border-color);border-radius:10px;overflow:hidden">'
			+ '<div style="background:linear-gradient(135deg,#7A4AB8,#3B1A63);color:#fff;padding:9px 13px;font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:center">'
			+ "<span>" + esc(label) + (d.date ? " · " + esc(frappe.datetime.str_to_user(d.date)) : "") + ((d.title || d.title_ar) ? " — " + esc(lang === "ar" ? (d.title_ar || d.title) : (d.title || d.title_ar)) : "") + "</span>"
			+ '<span><span style="opacity:.85;font-weight:500;margin-inline-end:8px">' + dayRows.length + " " + __("sessions") + "</span>"
			+ '<button class="btn btn-xs ido-add-sess" data-day="' + d.day_no + '" data-date="' + (d.date || "") + '" style="background:rgba(255,255,255,.2);color:#fff;border:0;padding:2px 9px">+ ' + __("Add") + "</button></span></div>";

		if (!dayRows.length) {
			html += '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12.5px">' + esc(L.noSessions) + "</div></div>";
			return;
		}
		html += '<table class="table table-sm" style="margin:0;font-size:12.5px">'
			+ '<thead><tr><th style="width:112px">' + esc(L.time) + "</th><th>" + esc(L.session) + '</th><th style="width:120px">' + esc(L.hall) + '</th><th style="width:105px">' + esc(L.track) + '</th><th style="width:95px">' + __("Type") + '</th><th style="width:70px"></th></tr></thead><tbody>';
		groups.forEach(function (g) {
			if (g.sec) {
				const st = window.IDO_AGENDA.secLabel(g.sec, lang);
				const range = (g.sec.start_time && g.sec.end_time) ? hm(g.sec.start_time) + "–" + hm(g.sec.end_time) : "";
				html += '<tr><td colspan="6" style="background:#efe8f8;font-weight:700;color:#3B1A63;font-size:12px;padding:6px 12px">'
					+ esc(st || "") + (range ? ' <span style="font-weight:500;color:#7a6f92">· ' + range + "</span>" : "")
					+ (g.sec.hall ? ' <span style="font-weight:500;color:#7a6f92">· ' + esc(g.sec.hall) + "</span>" : "") + "</td></tr>";
			}
			if (!g.rows.length) { html += '<tr><td colspan="6" style="text-align:center;color:#bbb;font-size:11.5px;padding:8px">' + esc(L.noSessions) + "</td></tr>"; return; }
			g.rows.forEach(function (r) {
				const t = TYPE[r.session_type] ? TYPE[r.session_type][rtl ? 0 : 1] : (r.session_type || "");
				html += "<tr>"
					+ '<td style="white-space:nowrap;color:#5C2D91;font-weight:600">' + hm(r.start_time) + "–" + hm(r.end_time) + "</td>"
					+ "<td><b>" + esc(lang === "ar" ? (r.title_ar || r.title) : (r.title || r.title_ar)) + "</b>"
					+ (r.navigation_note ? '<div style="font-size:10.5px;color:var(--text-muted)">' + esc(r.navigation_note) + "</div>" : "") + "</td>"
					+ "<td>" + esc(r.hall || "—") + "</td><td>" + esc(r.track || "—") + '</td><td style="font-size:11.5px;color:var(--text-muted)">' + esc(t) + "</td>"
					+ '<td><a class="ido-open-sess" data-n="' + esc(r.name) + '" style="font-size:11px;cursor:pointer">' + __("Open") + "</a></td></tr>";
			});
		});
		html += "</tbody></table></div>";
	});
	wrap.$wrapper.html('<div style="max-height:560px;overflow:auto">' + html + "</div>");
	wrap.$wrapper.find(".ido-add-sess").on("click", function () {
		frappe.new_doc("IDO Session", { event: frm.doc.name, day: String($(this).data("day")), date: $(this).data("date") });
	});
	wrap.$wrapper.find(".ido-open-sess").on("click", function () { frappe.set_route("Form", "IDO Session", $(this).data("n")); });
	wrap.$wrapper.find(".ido-refresh-agenda").on("click", function () { renderDayAgenda(frm); });
}

// ---- Programme Day dropdown: options come from the event's own days ----
function dayOptions(frm) {
	let days = (frm.doc.days || []).slice().sort((a, b) => (a.day_no || 0) - (b.day_no || 0));
	// no rows yet? derive them straight from the date range so the dropdown is never empty
	if (!days.length && frm.doc.start_date && frm.doc.end_date) {
		days = idoDateList(frm.doc.start_date, frm.doc.end_date).map(function (dt, i) {
			return { day_no: i + 1, date: dt, is_pre_day: 0 };
		});
	}
	if (!days.length) return [""];
	const lang = frappe.boot.lang === "en" ? "en" : "ar";
	return [""].concat(days.map(d => String(d.day_no)));
}
function dayHint(){ return window.IDO_DAY_HINT || ""; }
// values stay numeric (so nothing downstream breaks) but the visible option text shows day + date
function relabelDaySelects(frm) {
	const map = {};
	let src = (frm.doc.days || []).filter(d => !d.is_pre_day);
	if (!src.length && frm.doc.start_date && frm.doc.end_date) {
		src = idoDateList(frm.doc.start_date, frm.doc.end_date).map(function (dt, i) { return { day_no: i + 1, date: dt }; });
	}
	src.forEach(function (d) {
		const lang = frappe.boot.lang === "en" ? "en" : "ar";
		const base = (lang === "ar" ? "اليوم " : "Day ") + d.day_no;
		map[String(d.day_no)] = base + (d.date ? " · " + frappe.datetime.str_to_user(d.date) : "");
	});
	const gw = frm.get_field("agenda_sections");
	if (!gw || !gw.grid) return;
	$(gw.grid.wrapper).find('select[data-fieldname="event_day"]').each(function () {
		$(this).find("option").each(function () {
			const v = this.value;
			if (v && map[v] && this.text !== map[v]) this.text = map[v];
		});
	});
}
// a <select> is created only when the cell is opened — watch for it
if (!window.__idoDayObserver) {
	window.__idoDayObserver = new MutationObserver(function (muts) {
		if (!window.cur_frm || !cur_frm.doc || cur_frm.doc.doctype !== "IDO Event") return;
		for (const m of muts) {
			for (const n of m.addedNodes) {
				if (n.nodeType !== 1) continue;
				const sel = n.matches && n.matches('select[data-fieldname="event_day"]') ? n
					: (n.querySelector && n.querySelector('select[data-fieldname="event_day"]'));
				if (sel) { relabelDaySelects(cur_frm); return; }
			}
		}
	});
	window.__idoDayObserver.observe(document.body, { childList: true, subtree: true });
}
function fillDayOptions(frm) {
	const opts = dayOptions(frm);
	const optStr = opts.join("\n");
	// write onto every layer the grid reads from, and as a newline string (Frappe's native format)
	const meta = frappe.get_meta("IDO Agenda Section");
	const mf = meta && (meta.fields || []).find(f => f.fieldname === "event_day");
	if (mf) { mf.fieldtype = "Select"; mf.options = optStr; }
	const dm = frappe.meta.docfield_map && frappe.meta.docfield_map["IDO Agenda Section"];
	if (dm && dm.event_day) { dm.event_day.fieldtype = "Select"; dm.event_day.options = optStr; }
	const grid = frm.get_field("agenda_sections");
	if (grid && grid.grid) {
		grid.grid.update_docfield_property("event_day", "options", optStr);
		if (grid.grid.docfields) { const g = grid.grid.docfields.find(f => f.fieldname === "event_day"); if (g) { g.fieldtype = "Select"; g.options = optStr; } }
		(grid.grid.grid_rows || []).forEach(function (row) {
			const c = row.columns && row.columns.event_day;
			if (c && c.df) { c.df.fieldtype = "Select"; c.df.options = optStr; }
		});
		grid.grid.refresh();
		setTimeout(function () {
			(grid.grid.grid_rows || []).forEach(function (row) {
				const c = row.columns && row.columns.event_day;
				if (c && c.df) { c.df.fieldtype = "Select"; c.df.options = optStr; }
				if (row.on_grid_fields_dict && row.on_grid_fields_dict.event_day) {
					const f = row.on_grid_fields_dict.event_day;
					f.df.options = optStr; if (f.refresh) f.refresh();
					if (f.set_formatted_input && row.doc) f.set_formatted_input(row.doc.event_day);
				}
			});
		}, 300);
	}
	// show the day's date under the dropdown so the number is never ambiguous
	let hintSrc = (frm.doc.days || []).filter(d => !d.is_pre_day).sort((a,b)=>(a.day_no||0)-(b.day_no||0));
	if (!hintSrc.length && frm.doc.start_date && frm.doc.end_date) hintSrc = idoDateList(frm.doc.start_date, frm.doc.end_date).map(function(dt,i){ return {day_no:i+1,date:dt}; });
	const hint = hintSrc.map(d => d.day_no + " = " + (d.date ? frappe.datetime.str_to_user(d.date) : "—")).join("  ·  ")
		+ ((frm.doc.days || []).length ? "" : "  —  " + __("day rows not created yet"));
	if (mf) mf.description = hint;
	if (dm && dm.event_day) dm.event_day.description = hint;
	window.IDO_DAY_HINT = hint;
	window.IDO_DAY_OPTS = window.IDO_DAY_OPTS || {};
	window.IDO_DAY_OPTS[frm.doc.name] = opts;
}
// keep the dropdown in sync when days are edited
frappe.ui.form.on("IDO Event Day", {
	day_no(frm) { fillDayOptions(frm); },
	date(frm) { fillDayOptions(frm); },
	days_remove(frm) { fillDayOptions(frm); },
});
// normalise "1 — Day 1 · 08-09-2026" back to the plain number before saving
frappe.ui.form.on("IDO Event", {
	validate(frm) {
		(frm.doc.agenda_sections || []).forEach(function (r) {
			if (r.event_day) r.event_day = String(r.event_day).split(" — ")[0].trim();
		});
	},
});

// ---- Programme Days generated from start_date / end_date ----
function idoDateList(start, end) {
	const out = [];
	if (!start || !end) return out;
	let d = frappe.datetime.str_to_obj(start);
	const last = frappe.datetime.str_to_obj(end);
	if (d > last) return out;
	let guard = 0;
	while (d <= last && guard++ < 400) {
		out.push(frappe.datetime.obj_to_str(d).slice(0, 10));
		d = frappe.datetime.str_to_obj(frappe.datetime.add_days(frappe.datetime.obj_to_str(d).slice(0, 10), 1));
	}
	return out;
}
function syncProgrammeDays(frm, opts) {
	opts = opts || {};
	const dates = idoDateList(frm.doc.start_date, frm.doc.end_date);
	if (!dates.length) return { added: 0, removed: 0, kept: 0 };
	const existing = frm.doc.days || [];
	// keep any row whose date is still inside the range (preserves titles)
	const byDate = {};
	existing.forEach(r => { if (r.date) byDate[String(r.date).slice(0, 10)] = r; });
	const pre = existing.filter(r => r.is_pre_day);        // Day -1 rows are kept as-is
	const stale = existing.filter(r => !r.is_pre_day && (!r.date || dates.indexOf(String(r.date).slice(0, 10)) === -1));
	let added = 0, kept = 0;
	const rows = [];
	dates.forEach(function (dt, i) {
		const old = byDate[dt];
		if (old && !old.is_pre_day) { old.day_no = i + 1; rows.push(old); kept++; }
		else { rows.push({ day_no: i + 1, date: dt, title: "Day " + (i + 1), title_ar: "اليوم " + (i + 1) }); added++; }
	});
	if (!opts.silent && stale.length) {
		frappe.show_alert({ message: __("{0} day(s) outside the new date range were removed", [stale.length]), indicator: "orange" }, 6);
	}
	frm.clear_table("days");
	pre.forEach(function (p) { const c = frm.add_child("days"); Object.assign(c, p); });
	rows.forEach(function (r) { const c = frm.add_child("days"); Object.assign(c, r); });
	frm.refresh_field("days");
	return { added: added, removed: stale.length, kept: kept, total: rows.length };
}
frappe.ui.form.on("IDO Event", {
	start_date(frm) { queueSync(frm); },
	end_date(frm) { queueSync(frm); },
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Rebuild Programme Days"), function () {
			frappe.confirm(__("Regenerate the day rows from the start and end dates? Existing day titles are kept."), function () {
				const r = syncProgrammeDays(frm);
				frm.save().then(function () {
					fillDayOptions(frm); renderDayAgenda(frm);
					frappe.msgprint({ title: __("Programme Days"), indicator: "green",
						message: __("Total: {0} · new: {1} · kept: {2} · removed: {3}", [r.total, r.added, r.kept, r.removed]) });
				});
			});
		}, __("Agenda"));
	},
});
let __idoSyncTimer = null;
function queueSync(frm) {
	if (!frm.doc.start_date || !frm.doc.end_date) return;
	clearTimeout(__idoSyncTimer);
	__idoSyncTimer = setTimeout(function () { autoSync(frm); }, 400);
}
function autoSync(frm) {
	const dates = idoDateList(frm.doc.start_date, frm.doc.end_date);
	const cur = (frm.doc.days || []).filter(d => !d.is_pre_day).length;
	if (!dates.length) return;
	if (!cur) { const r = syncProgrammeDays(frm, { silent: true });
		frappe.show_alert({ message: __("{0} programme days created", [r.total]), indicator: "blue" }); return; }
	if (cur === dates.length) { syncProgrammeDays(frm, { silent: true }); return; }
	frappe.confirm(__("The date range now covers {0} day(s) but the table has {1}. Update the day rows?", [dates.length, cur]), function () {
		const r = syncProgrammeDays(frm);
		frappe.show_alert({ message: __("Days updated: {0}", [r.total]), indicator: "green" });
	});
}
frappe.ui.form.on("IDO Event", { show_agenda(frm) { renderDayAgenda(frm); } });

// existing events saved before auto-generation existed: create the missing day rows once
function backfillDays(frm) {
	if (!frm.doc.start_date || !frm.doc.end_date) return;
	const have = (frm.doc.days || []).filter(d => !d.is_pre_day).length;
	const need = idoDateList(frm.doc.start_date, frm.doc.end_date).length;
	if (have || !need) return;
	syncProgrammeDays(frm, { silent: true });
	frm.dashboard.add_comment(__("{0} programme days were generated from the event dates — save to keep them.", [need]), "blue", true);
}

// --- IDO Event — Daily Transport ---
frappe.ui.form.on("IDO Event", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("توليد مهام النقل اليومية"), () => {
			frappe.prompt([
				{ fieldname: "hotel", fieldtype: "Link", options: "IDO Hotel", label: __("الفندق"), reqd: 1 },
				{ fieldname: "out_time", fieldtype: "Time", label: __("موعد الذهاب للمقر"), default: "08:00:00", reqd: 1 },
				{ fieldname: "back_time", fieldtype: "Time", label: __("موعد الرجوع للفندق"), default: "18:00:00", reqd: 1 },
				{ fieldname: "only_with_transport", fieldtype: "Check", label: __("الضيوف الذين لديهم نقل مشمول فقط"), default: 1 },
			], async v => {
				const days = (frm.doc.days || []).slice().sort((a,b) => (a.day_no||0) - (b.day_no||0));
				if (!days.length) return frappe.msgprint(__("أضف أيام الفعالية أولًا"));
				let guests = await frappe.db.get_list("IDO Guest", { filters: { event: frm.doc.name }, fields: ["name","full_name","travel_mode"], limit: 500 });
				if (!guests.length) return frappe.msgprint(__("لا يوجد ضيوف"));
				const drivers = await frappe.db.get_list("IDO Driver", { filters: { status: ["!=","off_duty"] }, fields: ["name"], limit: 50 });
				let made = 0, tasks = 0, di = 0;
				const first = days[0], last = days[days.length-1];
				for (const g of guests) {
					for (const d of days) {
						const legs = [];
						if (d.day_no === first.day_no && g.travel_mode === "flying") legs.push(["Airport → Hotel", "مطار الملك خالد الدولي", v.hotel, d.date + " 00:00:00", "وصول — استقبال من المطار"]);
						legs.push(["Hotel → Venue", v.hotel, frm.doc.venue || "Venue", d.date + " " + v.out_time, "ذهاب اليوم " + d.day_no]);
						legs.push(["Venue → Hotel", frm.doc.venue || "Venue", v.hotel, d.date + " " + v.back_time, "رجوع اليوم " + d.day_no]);
						if (d.day_no === last.day_no && g.travel_mode === "flying") legs.push(["Hotel → Airport", v.hotel, "مطار الملك خالد الدولي", d.date + " 20:00:00", "مغادرة — توصيل للمطار"]);
						for (const [type, from, to, when, label] of legs) {
							const dup = await frappe.db.get_list("IDO Transport Trip", { filters: { guest: g.name, trip_type: type, scheduled_at: when }, fields: ["name"], limit: 1 });
							if (dup.length) continue;
							const drv = drivers.length ? drivers[di++ % drivers.length].name : null;
							if (drv && type !== "Airport → Hotel") {
								try { await frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "IDO Transport Trip", guest: g.name, driver: drv,
									trip_type: type, pickup_location: from, destination: to, hotel: v.hotel, scheduled_at: when, state: "assigned" } } }); made++; } catch (e) {}
							}
							await frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "IDO Task", subject: label + " — " + (g.full_name || g.name),
								event: frm.doc.name, guest: g.name, team: "driver", status: "open", due_date: when, event_day: d.day_no,
								source_type: "daily_transport", source_doctype: "IDO Event", source_name: frm.doc.name,
								details: from + " → " + to } } }); tasks++;
						}
					}
				}
				frappe.msgprint({ title: __("تم التوليد"), indicator: "green",
					message: __("تم إنشاء {0} رحلة نقل و {1} مهمة سائق على {2} يوم لـ {3} ضيف.", [made, tasks, days.length, guests.length]) });
			}, __("مهام النقل اليومية"), __("توليد"));
		}, __("العمليات"));
		frm.add_custom_button(__("مهام الفعالية"), () => frappe.set_route("List","IDO Task",{event:frm.doc.name}), __("العمليات"));
		frm.add_custom_button(__("الباقات"), () => frappe.set_route("List","IDO Package",{event:frm.doc.name}), __("العمليات"));
		frm.add_custom_button(__("التسجيلات"), () => frappe.set_route("List","IDO Registration",{event:frm.doc.name}), __("العمليات"));
	}
});

// ---- Simple Event Plan: days → sessions → tasks ----
async function idoShowEventPlan(frm) {
	if (!frm.doc.name) return;
	const days = (frm.doc.days || []).slice().sort((a, b) => (a.day_no || 0) - (b.day_no || 0));
	if (!days.length) {
		frappe.msgprint(__("أضف أيام الخطة أولًا (قسم خطة الفعالية)، ثم احفظ."));
		return;
	}
	const sessions = await frappe.db.get_list("IDO Session", {
		filters: { event: frm.doc.name },
		fields: ["name", "title", "day", "date", "start_time", "end_time", "hall"],
		order_by: "day asc, start_time asc",
		limit: 500,
	});
	const byDay = {};
	sessions.forEach((s) => {
		const k = String(s.day || "");
		(byDay[k] = byDay[k] || []).push(s);
	});
	let html = '<div style="padding:8px 4px;line-height:1.6">';
	days.forEach((d) => {
		const label = (d.is_pre_day ? __("اليوم التمهيدي") : __("اليوم") + " " + d.day_no)
			+ (d.date ? " · " + frappe.datetime.str_to_user(d.date) : "")
			+ (d.title_ar || d.title ? " — " + (d.title_ar || d.title) : "");
		html += '<div style="margin:14px 0 6px;font-weight:600;color:#3B1A63">' + frappe.utils.escape_html(label) + "</div>";
		const rows = byDay[String(d.day_no)] || [];
		if (!rows.length) {
			html += '<div style="color:var(--text-muted);padding:4px 8px">' + __("لا جلسات بعد") + "</div>";
			return;
		}
		html += '<ul style="margin:0;padding-inline-start:18px">';
		rows.forEach((s) => {
			const t = (s.start_time || "").toString().slice(0, 5) + "–" + (s.end_time || "").toString().slice(0, 5);
			html += '<li><a href="/app/ido-session/' + encodeURIComponent(s.name) + '">'
				+ frappe.utils.escape_html(s.title || s.name) + "</a>"
				+ ' <span style="color:var(--text-muted);font-size:12px">' + frappe.utils.escape_html(t)
				+ (s.hall ? " · " + frappe.utils.escape_html(s.hall) : "") + "</span></li>";
		});
		html += "</ul>";
	});
	html += "</div>";
	const d = new frappe.ui.Dialog({ title: __("خطة الفعالية"), size: "large", primary_action_label: __("إضافة جلسة"),
		primary_action() { d.hide(); idoAddSessionPrompt(frm); } });
	$(html).appendTo(d.body);
	d.show();
}

function idoAddSessionPrompt(frm) {
	const days = (frm.doc.days || []).slice().sort((a, b) => (a.day_no || 0) - (b.day_no || 0));
	if (!days.length) return frappe.msgprint(__("أضف أيام الخطة أولًا ثم احفظ."));
	const opts = days.map((d) => {
		const base = d.is_pre_day ? __("اليوم التمهيدي") : (__("اليوم") + " " + d.day_no);
		return { label: base + (d.date ? " · " + frappe.datetime.str_to_user(d.date) : ""), value: String(d.day_no) };
	});
	const dlg = new frappe.ui.Dialog({
		title: __("إضافة جلسة"),
		fields: [
			{ fieldname: "day_no", fieldtype: "Select", label: __("اليوم"), options: opts.map((o) => o.value).join("\n"), reqd: 1, default: opts[0] && opts[0].value },
			{ fieldname: "title", fieldtype: "Data", label: __("عنوان الجلسة"), reqd: 1 },
			{ fieldname: "start_time", fieldtype: "Time", label: __("من"), default: "09:00:00", reqd: 1 },
			{ fieldname: "end_time", fieldtype: "Time", label: __("إلى"), default: "10:00:00", reqd: 1 },
			{ fieldname: "hall", fieldtype: "Data", label: __("القاعة") },
		],
		primary_action_label: __("إنشاء"),
		async primary_action(v) {
			dlg.hide();
			const r = await frappe.call({
				method: "ido_event.api.create_session_for_day",
				args: {
					event: frm.doc.name,
					day_no: v.day_no,
					title: v.title,
					start_time: v.start_time,
					end_time: v.end_time,
					hall: v.hall,
				},
			});
			frappe.show_alert({ message: __("تم إنشاء الجلسة"), indicator: "green" });
			if (r.message && r.message.name) frappe.set_route("Form", "IDO Session", r.message.name);
		},
	});
	// nicer labels on select
	setTimeout(() => {
		const $sel = dlg.fields_dict.day_no.$input;
		$sel.empty();
		opts.forEach((o) => $sel.append($("<option>").attr("value", o.value).text(o.label)));
	}, 50);
	dlg.show();
}
