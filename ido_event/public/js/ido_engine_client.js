/**
 * Shared IDO journey helpers for Desk.
 * Loaded via app_include_js so doctype scripts keep `window.IDO = window.IDO || …`
 * and inherit engine-safe set/auto (avoids Guest before_save stage lock).
 */
(function () {
	const STAGES = [
		"invited",
		"registered",
		"kyc_approved",
		"visa_processing",
		"visa_approved",
		"flight_requested",
		"ticket_issued",
		"traveling",
		"arrived",
		"in_transit",
		"hotel_checkin",
		"badge_ready",
		"day1",
		"day2",
		"day3",
		"completed",
	];
	const FLY = new Set([
		"visa_processing",
		"visa_approved",
		"flight_requested",
		"ticket_issued",
		"traveling",
	]);
	const AR = {
		invited: "مدعو",
		registered: "مسجّل",
		kyc_approved: "الهوية معتمدة",
		visa_processing: "التأشيرة قيد المعالجة",
		visa_approved: "التأشيرة معتمدة",
		flight_requested: "طلب الطيران",
		ticket_issued: "التذكرة صادرة",
		traveling: "في الطريق",
		arrived: "وصل",
		in_transit: "نقل أرضي",
		hotel_checkin: "تسجيل فندقي",
		badge_ready: "بادج جاهز",
		day1: "اليوم 1",
		day2: "اليوم 2",
		day3: "اليوم 3",
		completed: "اكتملت الرحلة",
	};

	const VISA = new Set(["visa_processing", "visa_approved"]);
	const GCC_REGIONS = new Set(["gcc", "gcc_me"]);

	const latest = async (dt, g, f = "status") => {
		const r = await frappe.db.get_list(dt, {
			filters: { guest: g },
			fields: [f],
			order_by: "modified desc",
			limit: 1,
		});
		return r[0] ? r[0][f] : null;
	};

	const isGcc = (g) => GCC_REGIONS.has(g.region) || g.visa_status === "not_required";

	const path = (g) => {
		if (g.travel_mode === "local") return STAGES.filter((s) => !FLY.has(s));
		if (isGcc(g)) return STAGES.filter((s) => !VISA.has(s));
		return STAGES;
	};

	const next = (g) => {
		const p = path(g);
		const i = p.indexOf(g.stage);
		return i >= 0 && i < p.length - 1 ? p[i + 1] : null;
	};

	const gate = async (t, g) => {
		const kyc = await latest("IDO KYC Verification", g.name);
		const visa = await latest("IDO Visa Application", g.name);
		const fl = await latest("IDO Flight Request", g.name);
		const arr = await latest("IDO Arrival", g.name, "confirmed");
		const trip = await latest("IDO Transport Trip", g.name, "state");
		const hot = await latest("IDO Hotel Stay", g.name, "check_in_state");
		if (t === "kyc_approved" && kyc !== "approved")
			return "قاعدة العمل 001: لا يمكن اعتماد مرحلة KYC قبل أن تصبح حالة التحقق من الهوية = approved.";
		if (t === "visa_processing" && kyc !== "approved")
			return "قاعدة العمل 002: لا يمكن بدء التأشيرة قبل اعتماد التحقق من الهوية.";
		if (t === "visa_approved" && !["approved", "issued", "not_required"].includes(visa))
			return "قاعدة العمل 001: لا يمكن الدخول في visa_approved قبل اعتماد/إصدار/إعفاء التأشيرة.";
		if (
			t === "flight_requested" &&
			!isGcc(g) &&
			!["approved", "issued", "not_required"].includes(visa)
		)
			return "قاعدة العمل 004: لا يمكن طلب الطيران قبل اعتماد التأشيرة.";
		if (["ticket_issued", "traveling"].includes(t) && fl !== "ticket_issued")
			return "قاعدة العمل 001: لا يمكن بدء السفر قبل وجود تذكرة.";
		if (t === "in_transit" && !arr)
			return "قاعدة العمل 005: لا يمكن إسناد السائق قبل تأكيد الوصول.";
		if (t === "hotel_checkin" && !["arrived", "completed"].includes(trip))
			return "قاعدة العمل 006: لا يمكن تسجيل دخول الفندق قبل وصول رحلة النقل.";
		if (t === "badge_ready" && hot !== "completed")
			return "قاعدة العمل 007: لا يمكن إصدار بطاقة الدخول قبل تسجيل دخول الفندق.";
		return null;
	};

	const set = async (g, to, action, reason, rule) => {
		const guest = typeof g === "string" ? g : g.name;
		await frappe.call({
			method: "ido_event.api.set_guest_stage",
			args: {
				guest,
				to_stage: to,
				action: action || "advance",
				reason: reason || "",
				rule: rule || "",
			},
		});
		if (g && typeof g === "object") g.stage = to;
	};

	const auto = async (gname, up_to) => {
		await frappe.call({
			method: "ido_event.api.auto_advance_guest",
			args: { guest: gname, up_to },
		});
	};

	const mirror = async (gname) => {
		const row = (
			await frappe.db.get_value("IDO Guest", gname, ["travel_mode", "region", "visa_status"])
		).message;
		const tm = row && row.travel_mode;
		const visaDefault =
			tm === "local" ||
			(row && (GCC_REGIONS.has(row.region) || row.visa_status === "not_required"))
				? "not_required"
				: "not_started";
		await frappe.db.set_value("IDO Guest", gname, {
			kyc_status: (await latest("IDO KYC Verification", gname)) || "pending",
			visa_status: (await latest("IDO Visa Application", gname)) || visaDefault,
			flight_status: (await latest("IDO Flight Request", gname)) || "-",
			arrival_confirmed: (await latest("IDO Arrival", gname, "confirmed")) || 0,
			trip_state: (await latest("IDO Transport Trip", gname, "state")) || "-",
			hotel_checkin_state:
				(await latest("IDO Hotel Stay", gname, "check_in_state")) || "pending",
			badge_state: (await latest("IDO Badge", gname, "state")) || "pending",
		});
	};

	const rnd = (n) => {
		const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
		let s = "";
		for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
		return s;
	};

	const timeline = async (gname) => {
		const g = await frappe.db.get_doc("IDO Guest", gname);
		const p = path(g);
		const cur = p.indexOf(g.stage);
		return p.map((s, i) => ({
			stage: s,
			label_ar: AR[s],
			state: i < cur ? "completed" : i === cur ? "current" : "pending",
		}));
	};

		window.IDO = {
		STAGES,
		AR,
		GCC_REGIONS,
		latest,
		path,
		next,
		gate,
		isGcc,
		set,
		auto,
		mirror,
		rnd,
		timeline,
		now: () => frappe.datetime.now_datetime(),
		__engine: true,
	};
})();
