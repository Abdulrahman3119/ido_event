// Copyright (c) 2026, I Do Holding and contributors
// Migrated from Desk Client Script(s) — IDO QR Pass (Form)

// --- IDO QR Pass — IDO Form ---
frappe.ui.form.on("IDO QR Pass", { validate(frm){ const rnd=n=>{const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<n;i++)s+=c[Math.floor(Math.random()*c.length)];return s;}; if(!frm.doc.token){frm.set_value("token",rnd(32));frm.set_value("checksum",rnd(12));frm.set_value("issued_at",frappe.datetime.now_datetime());} if(!frm.doc.expires_at) frm.set_value("expires_at",frappe.datetime.add_days(frappe.datetime.now_datetime(),7)); },
 refresh(frm){ if(frm.doc.token) frm.dashboard.add_section(`<div style="text-align:center"><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent("IDO:"+frm.doc.token+":"+frm.doc.checksum)}" alt="QR"><div style="font-size:11px;color:var(--text-muted)">IDO:${frm.doc.token}:${frm.doc.checksum}</div></div>`, "QR"); } });
