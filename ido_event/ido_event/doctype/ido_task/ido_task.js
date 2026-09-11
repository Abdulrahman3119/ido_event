// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Task (Form)

// --- IDO Task — Assignment ---
// team code -> the Frappe role that owns it
const IDO_TEAM_ROLE = {
	operations: "IDO Operations", travel_team: "IDO Travel Team", visa_team: "IDO Visa Team",
	airport_desk: "IDO Airport Desk", driver: "IDO Driver", hotel_desk: "IDO Hotel Desk",
	badge_team: "IDO Badge Team", usher: "IDO Usher", services: "IDO Guest Services",
	protocol: "IDO Protocol Desk", finance: "IDO Owner"
};

async function idoTeamMembers(team) {
	const role = IDO_TEAM_ROLE[team];
	if (!role) return [];
	if (!window.__idoTeamCache) window.__idoTeamCache = {};
	if (window.__idoTeamCache[role]) return window.__idoTeamCache[role];
	let users = [];
	try {
		const r = await frappe.call({ method: "frappe.client.get_list", args: {
			doctype: "Has Role", filters: { role: role, parenttype: "User" },
			fields: ["parent"], parent: "User", limit_page_length: 200 } });
		users = (r.message || []).map(x => x.parent);
	} catch (e) { users = []; }
	users = [...new Set(users)].filter(u => u && ["Administrator", "Guest"].indexOf(u) === -1);
	window.__idoTeamCache[role] = users;
	return users;
}

frappe.ui.form.on("IDO Task", {
	setup(frm) {
		// only show users who hold the selected team's role
		frm.set_query("assigned_to", function () {
			const role = IDO_TEAM_ROLE[frm.doc.team];
			if (!role) return {};
			return { query: "frappe.core.doctype.user.user.user_query", filters: { ignore_user_type: 1, role: role } };
		});
	},
	refresh(frm) {
		frm.trigger("team_hint");
		frm.trigger("due_summary");
		if (frm.is_new()) return;
		if (!frm.doc.assigned_to && frm.doc.team) {
			frm.add_custom_button(__("Notify whole team"), function () { notifyTeam(frm); }).addClass("btn-primary");
		}
		frm.add_custom_button(__("Assign to me"), function () { frm.set_value("assigned_to", frappe.session.user); frm.save(); });
	},
	async team(frm) {
		// clear an assignee that no longer belongs to the chosen team
		if (frm.doc.assigned_to) {
			const members = await idoTeamMembers(frm.doc.team);
			if (members.length && members.indexOf(frm.doc.assigned_to) === -1) {
				frm.set_value("assigned_to", "");
				frappe.show_alert({ message: __("Assignee cleared — not a member of this team"), indicator: "orange" });
			}
		}
		frm.trigger("team_hint");
	},
	async team_hint(frm) {
		if (!frm.doc.team) { frm.set_df_property("assigned_to", "description", ""); return; }
		const members = await idoTeamMembers(frm.doc.team);
		frm.set_df_property("assigned_to", "description",
			members.length
				? __("{0} member(s) in this team. Leave blank to notify all of them.", [members.length])
				: __("No users hold the {0} role yet.", [IDO_TEAM_ROLE[frm.doc.team]]));
		frm.refresh_field("assigned_to");
	},
	full_day(frm) {
		if (frm.doc.full_day) { frm.set_value("due_from", ""); frm.set_value("due_to", ""); }
		frm.trigger("due_summary");
	},
	due_from(frm) { frm.trigger("due_summary"); },
	due_to(frm) { frm.trigger("due_summary"); },
	due_date(frm) { frm.trigger("due_summary"); },
	due_summary(frm) {
		const mins = v => { const p = String(v || "0:0").split(":"); return (+p[0]) * 60 + (+(p[1] || 0)); };
		let txt = "";
		if (!frm.doc.due_date) txt = "";
		else if (frm.doc.full_day) txt = __("All day on {0}", [frappe.datetime.str_to_user(frm.doc.due_date)]);
		else if (frm.doc.due_from && frm.doc.due_to)
			txt = frappe.datetime.str_to_user(frm.doc.due_date) + " · " + String(frm.doc.due_from).slice(0,5) + " – " + String(frm.doc.due_to).slice(0,5);
		else if (frm.doc.due_from) txt = frappe.datetime.str_to_user(frm.doc.due_date) + " · " + __("from") + " " + String(frm.doc.due_from).slice(0,5);
		frm.set_df_property("due_date", "description", txt);
		frm.refresh_field("due_date");
	},
	validate(frm) {
		const mins = v => { const p = String(v || "0:0").split(":"); return (+p[0]) * 60 + (+(p[1] || 0)); };
		if (frm.doc.full_day) { frm.doc.due_from = null; frm.doc.due_to = null; return; }
		if (frm.doc.due_from && frm.doc.due_to && mins(frm.doc.due_to) <= mins(frm.doc.due_from))
			frappe.throw(__("To must be after From"));
		if ((frm.doc.due_from || frm.doc.due_to) && !frm.doc.due_date)
			frappe.throw(__("Set the Due Date before entering times"));
	},
	async after_save(frm) {
		if (frm.doc.__ido_notified) return;
		if (frm.doc.assigned_to) {
			await idoShare(frm.doc.name, frm.doc.assigned_to);
		} else if (frm.doc.team) {
			await notifyTeam(frm, true);
		}
		frm.doc.__ido_notified = 1;
	},
});

async function idoShare(name, user) {
	try {
		await frappe.call({ method: "frappe.share.add", args: { doctype: "IDO Task", name: name, user: user, read: 1, write: 1, notify: 1 } });
	} catch (e) { /* sharing is best-effort */ }
	try {
		await frappe.call({ method: "frappe.desk.form.assign_to.add", args: { doctype: "IDO Task", name: name, assign_to: JSON.stringify([user]), description: cur_frm && cur_frm.doc ? cur_frm.doc.subject : name } });
	} catch (e) {}
}

async function notifyTeam(frm, silent) {
	const members = await idoTeamMembers(frm.doc.team);
	if (!members.length) {
		if (!silent) frappe.msgprint({ message: __("No users hold the {0} role yet.", [IDO_TEAM_ROLE[frm.doc.team] || frm.doc.team]), indicator: "orange" });
		return;
	}
	try {
		await frappe.call({ method: "frappe.desk.form.assign_to.add", args: {
			doctype: "IDO Task", name: frm.doc.name, assign_to: JSON.stringify(members),
			description: frm.doc.subject || frm.doc.name } });
	} catch (e) {}
	for (const u of members) {
		try { await frappe.call({ method: "frappe.share.add", args: { doctype: "IDO Task", name: frm.doc.name, user: u, read: 1, write: 1, notify: 0 } }); } catch (e) {}
	}
	if (!silent) frappe.msgprint({ title: __("Team notified"), indicator: "green",
		message: __("Assigned to {0} member(s): {1}", [members.length, members.join(", ")]) });
	else frappe.show_alert({ message: __("Assigned to the whole {0} team ({1})", [frm.doc.team, members.length]), indicator: "blue" });
}

// --- IDO Task — IDO Form ---
frappe.ui.form.on("IDO Task", {
	refresh(frm) { if (frm.is_new()) return;
		if (frm.doc.status === "open") frm.add_custom_button(__("بدء المهمة"), () => { frm.set_value("status","in_progress"); frm.save(); }).addClass("btn-primary");
		if (["open","in_progress"].includes(frm.doc.status)) frm.add_custom_button(__("إنهاء المهمة"), () => {
			frm.set_value("status","done"); frm.set_value("completed_at", frappe.datetime.now_datetime()); frm.set_value("completed_by", frappe.session.user); frm.save(); }).addClass("btn-primary");
		if (frm.doc.source_doctype && frm.doc.source_name) frm.add_custom_button(__("فتح المصدر"), () => frappe.set_route("Form", frm.doc.source_doctype, frm.doc.source_name));
		if (frm.doc.guest) frm.add_custom_button(__("ملف الضيف"), () => frappe.set_route("Form","IDO Guest",frm.doc.guest));
	},
	validate(frm){ if(frm.doc.status==="done" && !frm.doc.completed_at){ frm.set_value("completed_at",frappe.datetime.now_datetime()); frm.set_value("completed_by",frappe.session.user); } }
});
