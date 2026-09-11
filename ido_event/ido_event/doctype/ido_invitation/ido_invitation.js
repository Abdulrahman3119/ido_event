// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO Invitation (Form)

frappe.ui.form.on("IDO Invitation", {
	setup(frm) {
		frm.set_query("package", function () {
			return { filters: { invitation_only: 1, is_active: 1, event: frm.doc.event || undefined } };
		});
	},
	event(frm) {
		if (frm.doc.package) frm.set_value("package", "");
	},

	validate(frm) {
		if (!frm.doc.invitation_code) {
			const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
			let s = "";
			for (let i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)];
			frm.set_value("invitation_code", s);
		}
		frm.set_value("secure_link", location.origin + "/guest?code=" + frm.doc.invitation_code);
	},

	refresh(frm) {
		if (frm.is_new()) return;

		const send = async (channel) => {
			frm.dashboard.set_headline_alert(__("جاري إرسال الدعوة…"), "blue");
			try {
				const r = await frappe.call({
					method: "ido.send_invitation",
					args: { invitation: frm.doc.name, channel },
					freeze: true,
					freeze_message: __("جاري إرسال الدعوة…"),
				});
				const msg = r.message || {};
				if (msg.whatsapp_url) window.open(msg.whatsapp_url, "_blank");
				if (msg.email_sent) {
					frappe.show_alert({
						message: __("أُرسلت الدعوة إلى {0}", [msg.email || ""]),
						indicator: "green",
					});
				} else if (msg.whatsapp_url) {
					frappe.show_alert({
						message: __("تم تجهيز رسالة واتساب"),
						indicator: "green",
					});
				}
				await idoSendAgenda(frm);
				frm.reload_doc();
			} catch (e) {
				/* frappe.call already shows server error */
			} finally {
				frm.dashboard.clear_headline();
			}
		};

		frm.add_custom_button(__("إرسال بالبريد"), () => send("email"), __("إرسال"));
		frm.add_custom_button(__("إرسال بواتساب"), () => send("whatsapp"), __("إرسال"));
		frm.add_custom_button(__("إرسال (بريد + واتساب)"), () => send("both"), __("إرسال"));
		frm.add_custom_button(
			__("نسخ الرابط"),
			() => frappe.utils.copy_to_clipboard(frm.doc.secure_link),
			__("إرسال")
		);
	},
});

async function idoSendAgenda(frm) {
	const mode = frm.doc.agenda_mode || "none";
	if (mode === "none" || !frm.doc.event) return;
	const ev = await frappe.db.get_doc("IDO Event", frm.doc.event).catch(() => null);
	if (!ev || ev.show_agenda === 0) {
		frappe.show_alert({
			message: __("الجدول مخفي لهذه الفعالية — لم يُرسل"),
			indicator: "orange",
		});
		return;
	}
	if (!window.IDO_AGENDA) {
		frappe.msgprint(__("افتح صفحة الفعالية مرة واحدة لتحميل محرك الجدول، ثم أعد الإرسال."));
		return;
	}
	try {
		if (frm.doc.agenda_as_pdf) await window.IDO_AGENDA.sendPdfTo(frm.doc.event, frm.doc.guest);
		else await window.IDO_AGENDA.sendTo(frm.doc.event, frm.doc.guest);
		frappe.show_alert({
			message:
				mode === "with_invitation"
					? __("أُرسل الجدول مع الدعوة")
					: __("أُرسل الجدول في رسالة منفصلة"),
			indicator: "blue",
		});
	} catch (e) {
		frappe.msgprint({
			message: __("تعذّر إرسال الجدول: {0}", [String(e.message || e).slice(0, 110)]),
			indicator: "orange",
		});
	}
}
