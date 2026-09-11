// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Arrival (List)

// --- IDO Arrival — Field Ops ---
const IDO_OPS_CSS = ".ido-ops{max-width:760px;margin:0 auto;direction:rtl;text-align:right}\n.ido-ops .ido-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;background:linear-gradient(135deg,#7A4AB8,#3B1A63);color:#fff;border-radius:14px;padding:16px 18px;margin-bottom:12px;flex-wrap:wrap}\n.ido-ops .ido-head .ico{font-size:20px;margin-inline-end:8px}\n.ido-ops .ido-head b{font-size:17px}.ido-ops .ido-head small{display:block;opacity:.85;font-size:12px;margin-top:2px}\n.ido-ops .ido-head .caps code{background:rgba(255,255,255,.16);color:#fff;border:0;font-size:10px;padding:2px 7px;border-radius:6px;margin-inline-start:4px}\n.ido-ops .ido-tabs{display:flex;gap:6px;margin-bottom:12px}\n.ido-ops .ido-tabs a{flex:1;text-align:center;padding:9px;border-radius:10px;background:var(--control-bg);color:var(--text-muted);cursor:pointer;font-size:13px;font-weight:600}\n.ido-ops .ido-tabs a.on{background:#5C2D91;color:#fff}\n.ido-ops .ido-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:12px}\n.ido-ops .ido-stats div{background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;padding:10px 12px}\n.ido-ops .ido-stats b{display:block;font-size:22px;color:#5C2D91}.ido-ops .ido-stats span{font-size:11px;color:var(--text-muted)}\n.ido-ops .ido-card{background:var(--card-bg);border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;margin-bottom:10px}\n.ido-ops .ido-card.sm{padding:9px 12px}\n.ido-ops .ido-card.ok{border-inline-start:4px solid #1F9D63}.ido-ops .ido-card.bad{border-inline-start:4px solid #C93A3A}\n.ido-ops .ido-card .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px}\n.ido-ops .ido-card .meta{font-size:12px;color:var(--text-muted);line-height:1.7}\n.ido-ops .ido-card .meta.ok{color:#1F9D63}\n.ido-ops .ido-card .hint{font-size:11px;color:#7a6f92;margin-top:6px}\n.ido-ops .ido-card label{display:block;font-size:12px;margin:8px 0 3px;color:var(--text-muted)}\n.ido-ops .acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:9px}\n.ido-ops .ido-sel,.ido-ops .ido-inp{padding:5px 9px;border:1px solid var(--border-color);border-radius:8px;background:var(--control-bg);color:var(--text-color);font-size:12px;min-width:150px}\n.ido-ops .ido-search{margin-bottom:10px}\n.ido-ops .ido-pill{padding:3px 10px;border-radius:999px;font-size:11px;background:var(--control-bg);color:var(--text-muted);white-space:nowrap}\n.ido-ops .ido-pill.ok{background:#E3F5EC;color:#1F9D63}.ido-ops .ido-pill.warn{background:#FBF0DA;color:#B4770F}.ido-ops .ido-pill.bad{background:#FBE3E3;color:#C93A3A}\n.ido-ops .ido-empty{text-align:center;padding:36px 16px;color:var(--text-muted)}\n.ido-ops .ido-empty h4{font-size:15px;color:var(--text-color)}\n.ido-ops .ido-skel{padding:30px;text-align:center;color:var(--text-muted)}\n.ido-ops #ido-cam{width:100%;border-radius:10px;margin:8px 0}\n.ido-ops h5{margin:14px 0 8px;font-size:13px;color:var(--text-muted)}\n";
window.IDO_OPS_RENDER = function (page, $b) {
	$b.addClass("ido-ops");
	frappe.dom.set_style(".ido-ops-shell{padding:4px 0}.ido-rolebar{display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap}.ido-rolesel{flex:1;min-width:180px;padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--control-bg);color:var(--text-color);font-size:13px;font-weight:600}" + IDO_OPS_CSS + ".ido-rolebar{display:flex;gap:8px;align-items:center;margin-bottom:12px}.ido-rolesel{flex:1;padding:7px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--control-bg);color:var(--text-color);font-size:13px;font-weight:600}");

	const ROLES = {
		airport_desk: { label: "مكتب المطار", desc: "استقبال · تأكيد الوصول · إسناد سائق", role: "IDO Airport Desk", caps: ["Arrival.Confirm","Driver.Assign","Guest.Scan"], icon: "✈" },
		driver:       { label: "السائق", desc: "مهام النقل من المطار للفندق", role: "IDO Driver", caps: ["Trip.Execute","Trip.ReadAssigned"], icon: "🚗" },
		hotel_desk:   { label: "مكتب الفندق", desc: "تسجيل الدخول وإسناد الغرف", role: "IDO Hotel Desk", caps: ["HotelStay.CheckIn","Room.Assign","RoomInventory.Read"], icon: "🏨" },
		badge_team:   { label: "فريق البادجات", desc: "طابور الطباعة · QR / NFC", role: "IDO Badge Team", caps: ["Badge.Print","Badge.SetState","QrPass.Issue"], icon: "🎫" },
		usher:        { label: "المرشد", desc: "تسجيل حضور الجلسات بالـ QR", role: "IDO Usher", caps: ["Session.CheckIn","Attendance.Write","Guest.ReadBasic"], icon: "📋" },
	};
	const SUP = ["System Manager","IDO Owner","IDO Event Manager","IDO Operations"];
	const myRoles = frappe.user_roles || [];
	const isSup = SUP.some(r => myRoles.includes(r));
	const allowed = Object.keys(ROLES).filter(k => isSup || myRoles.includes(ROLES[k].role));
	let ROLE = localStorage.getItem("ido_ops_role");
	if (!allowed.includes(ROLE)) ROLE = allowed[0] || null;
	let VIEW = "tasks", SESSION = null;

	const esc = frappe.utils.escape_html;
	const toast = (m, ind = "green") => frappe.show_alert({ message: m, indicator: ind }, 5);
	const pill = (s, cls) => `<span class="ido-pill ${cls || ""}">${esc(s || "—")}</span>`;
	const err = e => { let m = (e && e.message) || ""; try { if (e && e._server_messages) m = JSON.parse(e._server_messages).map(x => JSON.parse(x).message).join(" "); } catch (_) {} frappe.msgprint({ message: m || __("تعذّر التنفيذ"), indicator: "red", title: __("قاعدة عمل") }); };

	page.set_secondary_action(__("تحديث"), () => render(), "refresh");
	const roleField = page.add_field({ fieldname: "role", label: __("الدور"), fieldtype: "Select",
		options: allowed.map(k => ({ label: ROLES[k].label, value: k })),
		change: () => { ROLE = roleField.get_value(); localStorage.setItem("ido_ops_role", ROLE); render(); } });
	if (ROLE) roleField.set_value(ROLE);
	page.add_menu_item(__("مركز القيادة"), () => frappe.set_route("ido-events"));
	page.add_menu_item(__("صلاحيات هذا الدور"), () => frappe.msgprint({ title: __("صلاحيات هذا الدور"),
		message: (ROLES[ROLE].caps || []).map(c => `<code>${c}</code>`).join("<br>") }));

	// ---------- data ----------
	const today = frappe.datetime.get_today();
	const dayBounds = [today + " 00:00:00", today + " 23:59:59"];
	async function load() {
		if (ROLE === "airport_desk") return {
			awaiting: await frappe.db.get_list("IDO Arrival", { filters: { status: ["in", ["expected","landed"]] }, fields: ["name","guest","guest_name","flight_number","expected_at","terminal","status","assigned_driver","meeting_point","luggage_notes"], order_by: "expected_at asc", limit: 100 }),
			arrived: await frappe.db.get_list("IDO Arrival", { filters: { confirmed: 1 }, fields: ["name","guest_name","flight_number","assigned_driver","scanned_at"], order_by: "modified desc", limit: 50 }),
			drivers: await frappe.db.get_list("IDO Driver", { filters: { status: ["!=","off_duty"] }, fields: ["name","driver_name","status","vehicle"], limit: 100 }) };
		if (ROLE === "driver") { const d = await frappe.db.get_list("IDO Driver", { filters: { user: frappe.session.user }, fields: ["name"], limit: 1 });
			const f = { state: ["in", ["assigned","en_route","picked_up","arrived"]] }; if (d.length) f.driver = d[0].name; else if (!isSup) return { trips: [] };
			return { trips: await frappe.db.get_list("IDO Transport Trip", { filters: f, fields: ["name","guest","guest_name","driver_name","state","trip_type","pickup_location","destination","hotel","scheduled_at","luggage_notes"], order_by: "scheduled_at asc", limit: 100 }) }; }
		if (ROLE === "hotel_desk") return {
			arrivals: await frappe.db.get_list("IDO Hotel Stay", { filters: { check_in_state: ["in", ["pending","reserved"]] }, fields: ["name","guest","guest_name","hotel","room_number","check_in_date","check_in_state"], order_by: "check_in_date asc", limit: 100 }),
			inhouse: await frappe.db.get_list("IDO Hotel Stay", { filters: { check_in_state: "completed" }, fields: ["name","guest_name","hotel","room_number","check_out_date"], order_by: "modified desc", limit: 50 }),
			hotels: await frappe.db.get_list("IDO Hotel", { fields: ["name","hotel_name","city"], limit: 20 }) };
		if (ROLE === "badge_team") return {
			queue: await frappe.db.get_list("IDO Badge", { filters: { state: ["in", ["pending","queued","printed"]] }, fields: ["name","guest","guest_name","badge_type","state","qr_enabled","nfc_enabled","event"], order_by: "modified desc", limit: 100 }),
			ready: await frappe.db.get_list("IDO Badge", { filters: { state: ["in", ["ready","collected"]] }, fields: ["name","guest_name","badge_type","state"], order_by: "modified desc", limit: 50 }) };
		if (ROLE === "usher") return {
			sessions: await frappe.db.get_list("IDO Session", { fields: ["name","title","title_ar","hall","day","date","start_time","end_time","attendance_count","capacity"], order_by: "date asc, start_time asc", limit: 100 }),
			recent: SESSION ? await frappe.db.get_list("IDO Attendance", { filters: { session: SESSION }, fields: ["name","guest_name","method","checked_in_at"], order_by: "creation desc", limit: 15 }) : [] };
		return {};
	}

	// ---------- render ----------
	async function render() {
		if (!ROLE) return $b.html(`<div class="ido-empty"><h4>${__("لا صلاحية")}</h4><p>${__("دورك الحالي لا يملك صلاحية هذه الشاشة.")}</p></div>`);
		$b.html(`<div class="ido-skel">${__("جارٍ التحميل…")}</div>`);
		let d; try { d = await load(); } catch (e) { return err(e); }
		const r = ROLES[ROLE];
		const tabs = `<div class="ido-tabs">
			<a data-v="tasks" class="${VIEW==="tasks"?"on":""}">${__("مهامي")}</a>
			<a data-v="scan" class="${VIEW==="scan"?"on":""}">${__("مسح")}</a>
			<a data-v="activity" class="${VIEW==="activity"?"on":""}">${__("النشاط")}</a></div>`;
		const head = `<div class="ido-head"><div><span class="ico">${r.icon}</span><b>${r.label}</b><small>${r.desc}</small></div>
			<div class="caps">${r.caps.map(c=>`<code>${c}</code>`).join("")}</div></div>`;
		$b.html(head + tabs + `<div id="ido-view"></div>`);
		$b.find(".ido-tabs a").on("click", function () { VIEW = $(this).data("v"); render(); });
		const $v = $b.find("#ido-view");
		if (VIEW === "scan") return renderScan($v);
		if (VIEW === "activity") return renderActivity($v);
		({ airport_desk: airportView, driver: driverView, hotel_desk: hotelView, badge_team: badgeView, usher: usherView }[ROLE])($v, d);
	}

	function stats(items) { return `<div class="ido-stats">${items.map(([n,l])=>`<div><b>${n}</b><span>${l}</span></div>`).join("")}</div>`; }
	function empty(t, b) { return `<div class="ido-empty"><h4>${t}</h4>${b?`<p>${b}</p>`:""}</div>`; }

	// ---------- airport desk ----------
	function airportView($v, d) {
		const rows = d.awaiting.map(a => `<div class="ido-card" data-name="${a.name}" data-guest="${esc(a.guest)}">
			<div class="row"><b>${esc(a.guest_name||a.guest)}</b>${pill(a.status==="landed"?"هبطت":"بانتظار الوصول", a.status==="landed"?"warn":"")}</div>
			<div class="meta">${__("الرحلة")}: ${esc(a.flight_number||"—")} · ${__("المبنى")}: ${esc(a.terminal||"—")} · ${__("الوصول المتوقّع")}: ${esc(a.expected_at||"—")}</div>
			${a.assigned_driver?`<div class="meta ok">${__("تم إسناد السائق")}: ${esc(a.assigned_driver)}</div>`:""}
			<div class="acts">
				<button class="btn btn-xs btn-primary act-confirm">${__("تأكيد الوصول")}</button>
				<select class="ido-sel act-driver"><option value="">${__("اختر سائقًا متاحًا")}</option>${d.drivers.map(dr=>`<option value="${esc(dr.name)}" ${dr.name===a.assigned_driver?"selected":""}>${esc(dr.driver_name)} · ${esc(dr.status)}</option>`).join("")}</select>
				<button class="btn btn-xs act-assign">${__("إسناد سائق")}</button>
			</div></div>`).join("");
		$v.html(stats([[d.awaiting.length, __("بانتظار الوصول")],[d.arrived.length, __("وصلوا اليوم")],[d.drivers.filter(x=>x.status==="available").length, __("سائقون متاحون")]])
			+ `<input class="form-control ido-search" placeholder="${__("ابحث بالاسم أو رقم الرحلة أو الجواز…")}">`
			+ (rows || empty(__("لا وصولات متوقّعة الآن"))));
		$v.find(".ido-search").on("input", function () { const q=this.value.toLowerCase(); $v.find(".ido-card").each(function(){ $(this).toggle($(this).text().toLowerCase().includes(q)); }); });
		$v.find(".act-confirm").on("click", async function () { const $c=$(this).closest(".ido-card");
			try { await frappe.db.set_value("IDO Arrival", $c.data("name"), { status: "confirmed", confirmed: 1, confirmed_by: frappe.session.user, scanned_at: frappe.datetime.now_datetime() });
				await IDO_sync($c.data("guest"), "arrived"); toast(__("تم تأكيد وصول {0}", [$c.find("b").text()])); render(); } catch (e) { err(e); } });
		$v.find(".act-assign").on("click", async function () { const $c=$(this).closest(".ido-card"), drv=$c.find(".act-driver").val(); if(!drv) return frappe.msgprint(__("اختر سائقًا متاحًا"));
			const conf = await frappe.db.get_value("IDO Arrival", $c.data("name"), "confirmed");
			if (!conf.message.confirmed) return frappe.msgprint({ title: __("إسناد السائق مقفول"), indicator: "red", message: __("لا يمكن إسناد سائق قبل تأكيد وصول رحلة الضيف. أكّد الوصول أولًا.") + "<br><small>BR-005</small>" });
			try { await frappe.db.set_value("IDO Arrival", $c.data("name"), "assigned_driver", drv);
				const g = $c.data("guest"); const has = await frappe.db.get_list("IDO Transport Trip", { filters: { guest: g, state: ["not in", ["completed","cancelled"]] }, fields: ["name"], limit: 1 });
				if (!has.length) { const hs = await frappe.db.get_list("IDO Hotel Stay", { filters: { guest: g }, fields: ["hotel"], limit: 1 });
					await frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "IDO Transport Trip", guest: g, driver: drv, trip_type: "Airport → Hotel",
						pickup_location: "Airport", hotel: hs.length ? hs[0].hotel : null, state: "assigned", scheduled_at: frappe.datetime.now_datetime() } } }); }
				await frappe.db.set_value("IDO Driver", drv, "status", "on_trip");
				toast(__("أُسند السائق لـ {0} — إشعار للضيف", [$c.find("b").text()])); render(); } catch (e) { err(e); } });
	}

	// ---------- driver ----------
	const NEXT = { assigned: ["en_route", "بدء المهمة"], en_route: ["picked_up", "استلمت الضيف"], picked_up: ["arrived", "وصلت الوجهة"], arrived: ["completed", "إنهاء المهمة"] };
	const DRST = { assigned: "مُسندة", en_route: "في الطريق", picked_up: "استلم الضيف", arrived: "وصل", completed: "مكتملة" };
	function driverView($v, d) {
		if (!d.trips.length) return $v.html(empty(__("لا مهام نشطة الآن"), __("ستظهر المهام هنا بمجرد إسنادك لضيف من مكتب المطار.")));
		$v.html(d.trips.map(t => { const nx = NEXT[t.state];
			return `<div class="ido-card" data-name="${t.name}" data-guest="${esc(t.guest)}">
			<div class="row"><b>${esc(t.guest_name||t.guest)}</b>${pill(DRST[t.state]||t.state, t.state==="completed"?"ok":"warn")}</div>
			<div class="meta">${__("نقطة الاستلام")}: ${esc(t.pickup_location||"—")} → ${__("الوجهة")}: ${esc(t.destination||t.hotel||"—")}</div>
			<div class="meta">${esc(t.scheduled_at||"")} · ${__("ملاحظات الأمتعة")}: ${esc(t.luggage_notes||__("لا ملاحظات"))}</div>
			<div class="acts">${nx?`<button class="btn btn-xs btn-primary act-next" data-to="${nx[0]}">${__(nx[1])}</button>`:""}
				<button class="btn btn-xs act-open">${__("فتح المهمة")}</button></div></div>`; }).join(""));
		$v.find(".act-next").on("click", async function () { const $c=$(this).closest(".ido-card"), to=$(this).data("to");
			try { await frappe.db.set_value("IDO Transport Trip", $c.data("name"), { state: to, [{en_route:"started_at",picked_up:"picked_up_at",arrived:"arrived_at",completed:"completed_at"}[to]]: frappe.datetime.now_datetime() });
				if (to !== "completed") await IDO_sync($c.data("guest"), "in_transit"); else await frappe.db.set_value("IDO Driver", (await frappe.db.get_value("IDO Transport Trip", $c.data("name"), "driver")).message.driver, "status", "available");
				toast(to === "completed" ? __("اكتملت مهمة نقل {0}", [$c.find("b").text()]) : __("تحديث حالة النقل")); render(); } catch (e) { err(e); } });
		$v.find(".act-open").on("click", function () { frappe.set_route("Form", "IDO Transport Trip", $(this).closest(".ido-card").data("name")); });
	}

	// ---------- hotel desk ----------
	function hotelView($v, d) {
		const rows = d.arrivals.map(h => `<div class="ido-card" data-name="${h.name}" data-guest="${esc(h.guest)}" data-hotel="${esc(h.hotel)}">
			<div class="row"><b>${esc(h.guest_name||h.guest)}</b>${pill(h.check_in_state==="reserved"?"وصل الفندق":"وصول متوقّع", "warn")}</div>
			<div class="meta">${esc(h.hotel)} · ${__("الوصول")}: ${esc(h.check_in_date||"—")}</div>
			<div class="acts"><input class="ido-inp act-room" placeholder="${__("أدخل رقم الغرفة")}" value="${esc(h.room_number||"")}">
				<button class="btn btn-xs act-assign-room">${__("إسناد غرفة")}</button>
				<button class="btn btn-xs btn-primary act-complete">${__("إنهاء التسجيل")}</button></div>
			<div class="hint">${__("تسجيل الدخول يفتح إصدار بطاقة الدخول")} · BR-007</div></div>`).join("");
		$v.html(stats([[d.arrivals.length, __("وصول متوقّع")],[d.inhouse.length, __("نزلاء حاليون")],[d.hotels.length, __("الفنادق")]]) + (rows || empty(__("لا وصولات للفندق الآن"))));
		$v.find(".act-assign-room").on("click", async function () { const $c=$(this).closest(".ido-card"), room=$c.find(".act-room").val();
			if (!room) return frappe.msgprint(__("أدخل رقم الغرفة"));
			try { await frappe.db.set_value("IDO Hotel Stay", $c.data("name"), { room_number: room, check_in_state: "reserved" }); toast(__("غرفة مُسندة")); render(); } catch (e) { err(e); } });
		$v.find(".act-complete").on("click", async function () { const $c=$(this).closest(".ido-card"), room=$c.find(".act-room").val(), g=$c.data("guest");
			const mode = (await frappe.db.get_value("IDO Guest", g, "travel_mode")).message.travel_mode;
			const trip = await frappe.db.get_list("IDO Transport Trip", { filters: { guest: g }, fields: ["state"], order_by: "modified desc", limit: 1 });
			if (mode === "flying" && !(trip.length && ["arrived","completed"].includes(trip[0].state)))
				return frappe.msgprint({ title: __("تسجيل الدخول مقفول"), indicator: "red", message: __("لا يمكن تسجيل دخول الفندق قبل وصول رحلة النقل.") + "<br><small>BR-006</small>" });
			try { await frappe.db.set_value("IDO Hotel Stay", $c.data("name"), { room_number: room || null, check_in_state: "completed", checked_in_by: frappe.session.user, checked_in_at: frappe.datetime.now_datetime() });
				await IDO_sync(g, "hotel_checkin"); toast(__("اكتمل تسجيل دخول {0}", [$c.find("b").text()])); render(); } catch (e) { err(e); } });
	}

	// ---------- badge team ----------
	const BDNEXT = { pending: ["queued","إرسال للطباعة"], queued: ["printed","تمّت الطباعة"], printed: ["ready","جاهز للتسليم"], ready: ["collected","تسليم للضيف"] };
	const BDST = { pending: "مُقدّم", queued: "قيد الطباعة", printed: "طُبع", ready: "جاهز", collected: "سُلّم" };
	function badgeView($v, d) {
		const rows = d.queue.map(b => { const nx = BDNEXT[b.state];
			return `<div class="ido-card" data-name="${b.name}" data-guest="${esc(b.guest)}" data-event="${esc(b.event||"")}">
			<div class="row"><b>${esc(b.guest_name||b.guest)}</b>${pill(BDST[b.state]||b.state, "warn")}</div>
			<div class="meta">${__("الصفة")}: ${esc(b.badge_type||"—")} · ${b.qr_enabled?"QR":""} ${b.nfc_enabled?"NFC":""}</div>
			<div class="acts">${nx?`<button class="btn btn-xs btn-primary act-next" data-to="${nx[0]}">${__(nx[1])}</button>`:""}
				<button class="btn btn-xs act-qr">${__("إصدار تصريح الدخول")}</button>
				<button class="btn btn-xs act-open">${__("معاينة البادج")}</button></div></div>`; }).join("");
		$v.html(stats([[d.queue.filter(x=>x.state==="pending"||x.state==="queued").length, __("في الطابور")],[d.queue.filter(x=>x.state==="printed").length, __("طُبعت")],[d.ready.filter(x=>x.state==="ready").length, __("جاهزة")],[d.ready.filter(x=>x.state==="collected").length, __("سُلّمت")]])
			+ (rows || empty(__("لا بادجات في الطابور"), __("تظهر بطاقات الدخول بعد تسجيل دخول الضيوف للفندق (قاعدة العمل 007)."))));
		$v.find(".act-next").on("click", async function () { const $c=$(this).closest(".ido-card"), to=$(this).data("to"), g=$c.data("guest");
			if (["printed","ready","collected"].includes(to)) { const hs = await frappe.db.get_list("IDO Hotel Stay", { filters: { guest: g }, fields: ["check_in_state"], order_by: "modified desc", limit: 1 });
				if (!(hs.length && hs[0].check_in_state === "completed")) return frappe.msgprint({ title: __("إصدار بطاقة الدخول مقفول"), indicator: "red", message: __("لا يمكن إصدار بطاقة الدخول قبل تسجيل دخول الفندق.") + "<br><small>BR-007</small>" }); }
			try { const patch = { state: to }; if (to==="printed"||to==="ready") { patch.printed_at = frappe.datetime.now_datetime(); patch.printed_by = frappe.session.user; } if (to==="collected") patch.collected_at = frappe.datetime.now_datetime();
				await frappe.db.set_value("IDO Badge", $c.data("name"), patch); if (to==="ready"||to==="collected") await IDO_sync(g, "badge_ready");
				toast(__("تحديث حالة البادج")); render(); } catch (e) { err(e); } });
		$v.find(".act-qr").on("click", async function () { const $c=$(this).closest(".ido-card");
			try { const q = await IDO_qr($c.data("guest"), $c.data("event")); frappe.msgprint({ title: __("QR"), message: `<div style="text-align:center"><img src="${q.img}" style="width:200px;height:200px"><div style="font-size:11px">${q.payload}</div></div>` }); } catch (e) { err(e); } });
		$v.find(".act-open").on("click", function () { frappe.set_route("Form", "IDO Badge", $(this).closest(".ido-card").data("name")); });
	}

	// ---------- usher ----------
	function usherView($v, d) {
		const opts = d.sessions.map(s => `<option value="${esc(s.name)}" ${s.name===SESSION?"selected":""}>${__("اليوم")} ${s.day||"-"} · ${esc(s.title_ar||s.title)} · ${esc(s.hall||"")}</option>`).join("");
		const cur = d.sessions.find(s => s.name === SESSION);
		$v.html(`<div class="ido-card"><label>${__("اختر جلسة")}</label><select class="ido-sel sess"><option value="">—</option>${opts}</select>
			${cur?`<div class="meta">${__("القاعة")}: ${esc(cur.hall||"—")} · ${esc(cur.start_time||"")}–${esc(cur.end_time||"")}</div>
			<div class="meta ok">${__("الحضور")}: <b>${cur.attendance_count||0}</b> / ${cur.capacity||"∞"}</div>
			<div class="acts"><button class="btn btn-xs btn-primary act-scan">${__("مسح رمز الضيف")}</button><button class="btn btn-xs act-manual">${__("تسجيل يدوي")}</button></div>`:""}</div>
			${SESSION?`<h5>${__("آخر من سجّل الحضور")}</h5>${d.recent.length?d.recent.map(a=>`<div class="ido-card sm"><div class="row"><b>${esc(a.guest_name)}</b>${pill(a.method,"ok")}</div><div class="meta">${esc(a.checked_in_at||"")}</div></div>`).join(""):empty(__("لا حضور مُسجّل بعد"))}`:empty(__("اختر جلسة لبدء تسجيل الحضور"))}`);
		$v.find(".sess").on("change", function () { SESSION = this.value || null; render(); });
		$v.find(".act-scan").on("click", () => { VIEW = "scan"; render(); });
		$v.find(".act-manual").on("click", () => { const dlg = new frappe.ui.Dialog({ title: __("تسجيل يدوي"), fields: [{ fieldname: "guest", fieldtype: "Link", options: "IDO Guest", label: __("الضيف"), reqd: 1 }],
			primary_action_label: __("تسجيل الحضور"), primary_action: async v => { dlg.hide(); try { await frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "IDO Attendance", guest: v.guest, session: SESSION, method: "manual", checked_in_at: frappe.datetime.now_datetime(), checked_in_by: frappe.session.user } } });
				await IDO_count(SESSION); toast(__("تم تسجيل الحضور")); render(); } catch (e) { err(e); } } }); dlg.show(); });
	}

	// ---------- scan ----------
	function renderScan($v) {
		$v.html(`<div class="ido-card">
			<div class="row"><b>${ROLE==="usher"?__("مسح رمز الضيف"):__("مسح الجواز أو رمز الضيف")}</b>${SESSION?pill(SESSION,"ok"):""}</div>
			<div class="meta">${__("وجّه الكاميرا نحو رمز الدخول في تطبيق الضيف")} — ${__("أو أدخل القيمة يدويًا")}</div>
			<video id="ido-cam" playsinline style="display:none"></video>
			<label>${__("القيمة")}</label><input class="ido-inp" id="ido-payload" placeholder="IDO:… ${__("أو رقم الجواز")}">
			<label>${__("النوع")}</label><select class="ido-sel" id="ido-ctx"><option value="qr">QR</option><option value="passport">${__("جواز سفر")}</option></select>
			<div class="acts"><button class="btn btn-xs btn-primary act-scan">${__("تحقّق")}</button><button class="btn btn-xs act-sim">${__("محاكاة مسح ناجح")}</button></div></div><div id="ido-res"></div>`);
		$v.find(".act-scan").on("click", () => doScan($v.find("#ido-payload").val(), $v.find("#ido-ctx").val()));
		$v.find(".act-sim").on("click", async () => { const q = await frappe.db.get_list("IDO QR Pass", { filters: { revoked: 0 }, fields: ["token","checksum"], limit: 1 });
			if (!q.length) return frappe.msgprint(__("لا توجد تصاريح دخول صادرة بعد"));
			$v.find("#ido-payload").val(`IDO:${q[0].token}:${q[0].checksum}`); doScan($v.find("#ido-payload").val(), "qr"); });
		startCam($v);
	}
	function startCam($v) { if (!("BarcodeDetector" in window) || !navigator.mediaDevices) return;
		const v = $v.find("#ido-cam")[0]; navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(s => { v.srcObject = s; v.style.display = "block"; v.play();
			const det = new BarcodeDetector({ formats: ["qr_code"] });
			const tick = async () => { if (!document.body.contains(v)) return s.getTracks().forEach(t => t.stop());
				try { const c = await det.detect(v); if (c.length) { $v.find("#ido-payload").val(c[0].rawValue); s.getTracks().forEach(t=>t.stop()); v.style.display="none"; return doScan(c[0].rawValue, "qr"); } } catch (_) {}
				requestAnimationFrame(tick); }; tick(); }).catch(() => {}); }

	async function doScan(payload, ctx) {
		const $r = $b.find("#ido-res"); payload = (payload || "").trim(); if (!payload) return;
		let guest = null, reason = "لا نتيجة";
		if (ctx === "passport") { const g = await frappe.db.get_list("IDO Guest", { filters: { passport_number: payload }, fields: ["name"], limit: 1 }); guest = g.length && g[0].name; }
		else { const p = payload.split(":"); if (p.length === 3) { const q = await frappe.db.get_list("IDO QR Pass", { filters: { token: p[1], checksum: p[2] }, fields: ["guest","revoked","expires_at"], limit: 1 });
			if (q.length) { if (q[0].revoked) reason = "البطاقة مُبطلة"; else if (q[0].expires_at && q[0].expires_at < frappe.datetime.now_datetime()) reason = "البطاقة منتهية"; else guest = q[0].guest; } } }
		if (!guest) return $r.html(`<div class="ido-card bad"><b>${__("لا نتيجة")}</b><div class="meta">${esc(reason)}</div></div>`);
		const g = (await frappe.db.get_list("IDO Guest", { filters: { name: guest }, fields: ["name","full_name","full_name_ar","stage","vip","organization","nationality","hotel_checkin_state","badge_state"], limit: 1 }))[0];
		let extra = "";
		if (ROLE === "usher" && SESSION) { try { await frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "IDO Attendance", guest, session: SESSION, method: ctx, checked_in_at: frappe.datetime.now_datetime(), checked_in_by: frappe.session.user } } });
			await IDO_count(SESSION); extra = `<span class="ido-pill ok">${__("تم تسجيل الحضور")}</span>`; toast(__("تم تسجيل الحضور")); } catch (e) { extra = `<span class="ido-pill bad">${esc((e.message||"").slice(0,80))}</span>`; } }
		const map = { airport_desk: ["IDO Arrival","Arrival.Confirm"], hotel_desk: ["IDO Hotel Stay","HotelStay.CheckIn"], badge_team: ["IDO Badge","Badge.SetState"], driver: ["IDO Transport Trip","Trip.Execute"] };
		let task = "";
		if (map[ROLE]) { const t = await frappe.db.get_list(map[ROLE][0], { filters: { guest }, fields: ["name"], order_by: "modified desc", limit: 1 });
			if (t.length) task = `<button class="btn btn-xs btn-primary act-task" data-dt="${map[ROLE][0]}" data-n="${t[0].name}">${__("فتح المهمة")} (${map[ROLE][1]})</button>`; }
		$r.html(`<div class="ido-card ok"><div class="row"><b>${esc(g.full_name_ar||g.full_name)}</b>${g.vip?pill("VIP","warn"):""}${extra}</div>
			<div class="meta">${esc(g.organization||"")} · ${esc(g.nationality||"")}</div>
			<div class="meta">${__("المرحلة")}: <b>${esc(g.stage)}</b> · ${__("الفندق")}: ${esc(g.hotel_checkin_state||"—")} · ${__("البادج")}: ${esc(g.badge_state||"—")}</div>
			<div class="acts">${task}<button class="btn btn-xs act-next-scan">${__("مسح التالي")}</button></div></div>`);
		$r.find(".act-task").on("click", function () { frappe.set_route("Form", $(this).data("dt"), $(this).data("n")); });
		$r.find(".act-next-scan").on("click", () => renderScan($b.find("#ido-view")));
	}

	// ---------- activity ----------
	async function renderActivity($v) {
		const feed = await frappe.db.get_list("IDO Stage Log", { fields: ["guest_name","from_stage","to_stage","action","actor","at"], order_by: "at desc", limit: 30 });
		$v.html(feed.length ? feed.map(f => `<div class="ido-card sm"><div class="row"><b>${esc(f.guest_name||"")}</b>${pill(f.action, f.action==="override"?"bad":"ok")}</div>
			<div class="meta">${esc(f.from_stage||"—")} ← ${esc(f.to_stage)} · ${esc(f.actor||"")} · ${esc(f.at||"")}</div></div>`).join("") : empty(__("لا نشاط بعد")));
	}

	// ---------- shared journey helpers ----------
	async function IDO_sync(guest, upTo) {
		const STAGES = ["invited","registered","kyc_approved","visa_processing","visa_approved","flight_requested","ticket_issued","traveling","arrived","in_transit","hotel_checkin","badge_ready","day1","day2","day3","completed"];
		const FLY = ["visa_processing","visa_approved","flight_requested","ticket_issued","traveling"];
		const last = async (dt, f) => { const r = await frappe.db.get_list(dt, { filters: { guest }, fields: [f], order_by: "modified desc", limit: 1 }); return r.length ? r[0][f] : null; };
		const g = (await frappe.db.get_list("IDO Guest", { filters: { name: guest }, fields: ["name","stage","travel_mode"], limit: 1 }))[0];
		await frappe.db.set_value("IDO Guest", guest, { kyc_status: await last("IDO KYC Verification","status") || "pending",
			visa_status: await last("IDO Visa Application","status") || (g.travel_mode==="local"?"not_required":"not_started"),
			flight_status: await last("IDO Flight Request","status") || "-", arrival_confirmed: await last("IDO Arrival","confirmed") || 0,
			trip_state: await last("IDO Transport Trip","state") || "-", hotel_checkin_state: await last("IDO Hotel Stay","check_in_state") || "pending",
			badge_state: await last("IDO Badge","state") || "pending" });
		const path = g.travel_mode === "local" ? STAGES.filter(s => !FLY.includes(s)) : STAGES;
		if (!path.includes(upTo)) return;
		let cur = g.stage;
		while (cur !== upTo) { const i = path.indexOf(cur), t = path[i+1]; if (!t || path.indexOf(t) > path.indexOf(upTo)) break;
			await frappe.db.set_value("IDO Guest", guest, "stage", t);
			await frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "IDO Stage Log", guest, from_stage: cur, to_stage: t, action: "auto", actor: frappe.session.user, at: frappe.datetime.now_datetime() } }, silent: true });
			cur = t; }
	}
	async function IDO_count(session) { const n = await frappe.db.count("IDO Attendance", { filters: { session } }); await frappe.db.set_value("IDO Session", session, "attendance_count", n); }
	async function IDO_qr(guest, event) {
		let q = await frappe.db.get_list("IDO QR Pass", { filters: { guest, revoked: 0 }, fields: ["token","checksum"], limit: 1 });
		if (!q.length) { const rnd = n => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i=0;i<n;i++) s += c[Math.floor(Math.random()*c.length)]; return s; };
			const doc = { doctype: "IDO QR Pass", guest, event, token: rnd(32), checksum: rnd(12), issued_at: frappe.datetime.now_datetime(), expires_at: frappe.datetime.add_days(frappe.datetime.now_datetime(), 7) };
			await frappe.call({ method: "frappe.client.insert", args: { doc } }); q = [doc]; }
		const payload = `IDO:${q[0].token}:${q[0].checksum}`;
		return { payload, img: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(payload) };
	}
	render();
};


frappe.listview_settings = frappe.listview_settings || {};
frappe.listview_settings["IDO Arrival"] = Object.assign(frappe.listview_settings["IDO Arrival"] || {}, {
	hide_name_column: true,
	onload(listview) {
		const KEY = "ido_ops_fullscreen";
		const $page = listview.page.wrapper;
		let $host = null, $bar = null, on = false;

		function mount() {
			on = true; localStorage.setItem(KEY, "1");
			$page.find(".layout-main-section > *").not(".ido-ops-shell").hide();
			$page.find(".layout-side-section").hide();
			if (!$host) {
				const $shell = $('<div class="ido-ops-shell"></div>').appendTo($page.find(".layout-main-section"));
				$bar = $('<div class="ido-rolebar"></div>').appendTo($shell);
				$host = $('<div></div>').appendTo($shell);
			}
			$host.parent().show(); $host.empty(); $bar.empty();
			const stub = {
				add_field: (o) => {
					const $sel = $('<select class="ido-rolesel"></select>')
						.append((o.options || []).map(x => `<option value="${x.value}">${x.label}</option>`).join("")).appendTo($bar);
					$sel.on("change", () => o.change && o.change());
					return { get_value: () => $sel.val(), set_value: v => $sel.val(v) };
				},
				set_secondary_action: (lbl, fn) => { $('<button class="btn btn-default btn-sm ido-refresh">↻</button>').appendTo($bar).on("click", fn); },
				add_menu_item: () => {},
			};
			$('<button class="btn btn-default btn-sm ido-exit">'+__("عرض القائمة")+'</button>').appendTo($bar).on("click", unmount);
			window.IDO_OPS_RENDER(stub, $host);
			listview.page.set_title(__("التشغيل الميداني"));
		}
		function unmount() {
			on = false; localStorage.removeItem(KEY);
			$page.find(".ido-ops-shell").hide();
			$page.find(".layout-main-section > *").not(".ido-ops-shell").show();
			$page.find(".layout-side-section").show();
			listview.page.set_title(__("IDO Arrival"));
		}
		listview.page.add_inner_button(__("التشغيل الميداني"), () => on ? unmount() : mount()).addClass("btn-primary");
		if (localStorage.getItem(KEY) === "1") setTimeout(mount, 300);
	}
});
