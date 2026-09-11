/*!
 * IDO Event workspace picker — filters Number Cards / Charts / list routes
 * by the selected IDO Event.
 */
frappe.provide("ido_event.workspace");

(function () {
	const STORAGE_KEY = "ido_selected_event";
	const WORKSPACES = new Set(["IDO Events", "IDO Play", "الفعاليات"]);

	const ICONS = {
		calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/></svg>`,
		chevron: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`,
		close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`,
		check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>`,
	};

	ido_event.workspace = {
		selected: null,
		events: [],
		_patched: false,
		_menu_bound: false,
	};

	function get_workspace_name() {
		const route = frappe.get_route();
		if (!route || !route.length) return null;
		if (route[0] === "Workspaces" || route[0] === "workspace") {
			return route[1] || null;
		}
		return null;
	}

	function is_ido_workspace() {
		const name = get_workspace_name();
		if (!name) return false;
		if (WORKSPACES.has(name)) return true;
		return (
			name.indexOf("IDO") === 0 ||
			name.indexOf("فعالية") >= 0 ||
			name.indexOf("Event") >= 0
		);
	}

	function status_class(status) {
		const s = (status || "").toLowerCase();
		if (s === "active") return "is-active";
		if (s === "draft") return "is-draft";
		if (s === "completed" || s === "archived") return "is-completed";
		return "";
	}

	function event_label(ev) {
		if (!ev) return __("كل الفعاليات");
		const row = ido_event.workspace.events.find((e) => e.name === ev);
		if (!row) return ev;
		return row.event_name_ar || row.event_name || row.name;
	}

	function event_status(ev) {
		const row = ido_event.workspace.events.find((e) => e.name === ev);
		return row ? row.status : "";
	}

	function format_dates(row) {
		if (!row) return "";
		const a = row.start_date || "";
		const b = row.end_date || "";
		if (a && b) return `${a} → ${b}`;
		return a || b || row.code || "";
	}

	ido_event.workspace.get_selected = function () {
		return ido_event.workspace.selected || localStorage.getItem(STORAGE_KEY) || null;
	};

	ido_event.workspace.set_selected = async function (event_name) {
		ido_event.workspace.selected = event_name || null;
		if (event_name) {
			localStorage.setItem(STORAGE_KEY, event_name);
		} else {
			localStorage.removeItem(STORAGE_KEY);
		}
		try {
			await frappe.xcall("ido_event.workspace_filters.set_selected_event", {
				event: event_name || "",
			});
		} catch (e) {
			console.warn("ido_event set_selected_event", e);
		}
		ido_event.workspace.close_menu();
		ido_event.workspace.render_menu();
		ido_event.workspace.update_label();
		ido_event.workspace.refresh_widgets();
	};

	ido_event.workspace.refresh_widgets = function () {
		let refreshed = 0;
		$(".widget").each(function () {
			const el = this;
			const widget = el.widget || $(el).data("widget") || null;
			if (!widget) return;
			try {
				if (typeof widget.render_card === "function") {
					widget.render_card();
					refreshed++;
				} else if (typeof widget.refresh === "function") {
					widget.refresh();
					refreshed++;
				} else if (typeof widget.fetch === "function") {
					widget.filters = widget.get_filters ? widget.get_filters() : widget.filters;
					widget.fetch(widget.filters || [], true);
					refreshed++;
				}
			} catch (e) {
				console.warn("ido_event refresh widget", e);
			}
		});
		if (!refreshed) {
			const route = frappe.get_route();
			if (route && route.length) {
				frappe.set_route(route);
			}
		}
	};

	ido_event.workspace.close_menu = function () {
		$(".ido-event-picker").removeClass("is-open");
	};

	ido_event.workspace.update_label = function () {
		const ev = ido_event.workspace.get_selected();
		const label = event_label(ev);
		const status = event_status(ev);
		const $dot = $("#ido-workspace-event-dot");
		const $label = $("#ido-workspace-event-label");
		const $hint = $("#ido-workspace-event-hint");
		const $clear = $("#ido-workspace-event-clear");

		if ($label.length) $label.text(label);
		if ($dot.length) {
			$dot.attr("class", "ido-event-picker__dot " + status_class(status));
		}
		if ($hint.length) {
			if (ev) {
				const row = ido_event.workspace.events.find((e) => e.name === ev);
				$hint.text(format_dates(row) || ev);
			} else {
				$hint.text(__("عرض كل البيانات"));
			}
		}
		if ($clear.length) {
			$clear.prop("disabled", !ev);
		}
		ido_event.workspace.render_menu();
	};

	ido_event.workspace.render_menu = function () {
		const $menu = $("#ido-workspace-event-menu");
		if (!$menu.length) return;
		const selected = ido_event.workspace.get_selected();
		const items = [
			{
				name: "",
				title: __("كل الفعاليات"),
				sub: __("بدون تصفية"),
				status: "",
			},
		].concat(
			(ido_event.workspace.events || []).map((e) => ({
				name: e.name,
				title: e.event_name_ar || e.event_name || e.name,
				sub: format_dates(e) || e.code || e.name,
				status: e.status || "",
			}))
		);

		$menu.empty();
		items.forEach((item) => {
			const is_sel = (selected || "") === (item.name || "");
			const sc = status_class(item.status);
			const $btn = $(`
				<button type="button" class="ido-event-picker__item ${is_sel ? "is-selected" : ""}" data-event="${frappe.utils.escape_html(
					item.name
				)}">
					<span class="ido-event-picker__dot ${sc}"></span>
					<span class="ido-event-picker__item-body">
						<span class="ido-event-picker__item-title"></span>
						<span class="ido-event-picker__item-sub"></span>
					</span>
					${item.status ? `<span class="ido-event-picker__badge ${sc}"></span>` : ""}
					${is_sel ? `<span class="ido-event-picker__chevron">${ICONS.check}</span>` : ""}
				</button>
			`);
			$btn.find(".ido-event-picker__item-title").text(item.title);
			$btn.find(".ido-event-picker__item-sub").text(item.sub);
			if (item.status) {
				$btn.find(".ido-event-picker__badge").text(__(item.status));
			}
			$menu.append($btn);
		});
	};

	ido_event.workspace.inject_picker = async function () {
		if (!is_ido_workspace()) {
			$("#ido-workspace-event-bar").remove();
			return;
		}

		let $host = $(".codex-editor, .workspace-body, .layout-main-section").first();
		if (!$host.length) {
			$host = $(
				".workspace-header, .page-head .page-head-content, .layout-main"
			).first();
		}
		if (!$host.length) return;

		if (!$("#ido-workspace-event-bar").length) {
			const bar = $(`
				<div id="ido-workspace-event-bar" class="ido-event-bar" role="region" aria-label="${__(
					"تصفية حسب الفعالية"
				)}">
					<div class="ido-event-bar__icon">${ICONS.calendar}</div>
					<div class="ido-event-bar__meta">
						<div class="ido-event-bar__eyebrow">${__("سياق الفعالية")}</div>
						<div id="ido-workspace-event-hint" class="ido-event-bar__hint">${__(
							"عرض كل البيانات"
						)}</div>
					</div>
					<div class="ido-event-bar__controls">
						<div class="ido-event-picker" id="ido-workspace-event-picker">
							<button type="button" class="ido-event-picker__btn" id="ido-workspace-event-btn" aria-haspopup="listbox" aria-expanded="false">
								<span id="ido-workspace-event-dot" class="ido-event-picker__dot"></span>
								<span id="ido-workspace-event-label" class="ido-event-picker__label">${__(
									"كل الفعاليات"
								)}</span>
								<span class="ido-event-picker__chevron">${ICONS.chevron}</span>
							</button>
							<div class="ido-event-picker__menu" id="ido-workspace-event-menu" role="listbox"></div>
						</div>
						<button type="button" class="ido-event-bar__clear" id="ido-workspace-event-clear" title="${__(
							"مسح التصفية"
						)}" aria-label="${__("مسح التصفية")}" disabled>
							${ICONS.close}
						</button>
					</div>
				</div>
			`);

			const $editor = $(".codex-editor").first();
			if ($editor.length) {
				bar.insertBefore($editor);
			} else {
				$host.prepend(bar);
			}

			$("#ido-workspace-event-btn").on("click", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const $picker = $("#ido-workspace-event-picker");
				const open = !$picker.hasClass("is-open");
				$(".ido-event-picker").removeClass("is-open");
				$picker.toggleClass("is-open", open);
				$(this).attr("aria-expanded", open ? "true" : "false");
			});

			$("#ido-workspace-event-menu").on("click", ".ido-event-picker__item", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const val = $(this).attr("data-event") || "";
				ido_event.workspace.set_selected(val || null);
			});

			$("#ido-workspace-event-clear").on("click", function (e) {
				e.preventDefault();
				ido_event.workspace.set_selected(null);
			});

			if (!ido_event.workspace._menu_bound) {
				ido_event.workspace._menu_bound = true;
				$(document).on("click.ido_event_picker", function (e) {
					if (!$(e.target).closest("#ido-workspace-event-picker").length) {
						ido_event.workspace.close_menu();
					}
				});
				$(document).on("keydown.ido_event_picker", function (e) {
					if (e.key === "Escape") ido_event.workspace.close_menu();
				});
			}
		}

		try {
			const res = await frappe.xcall("ido_event.workspace_filters.list_events");
			ido_event.workspace.events = res.events || [];
			if (!ido_event.workspace.selected) {
				ido_event.workspace.selected =
					localStorage.getItem(STORAGE_KEY) || res.selected || null;
			}
			ido_event.workspace.update_label();
		} catch (e) {
			console.warn("ido_event list_events", e);
		}
	};

	ido_event.workspace.patch_widgets = function () {
		if (ido_event.workspace._patched) return;
		ido_event.workspace._patched = true;

		const orig_xcall = frappe.xcall;
		frappe.xcall = function (method, args) {
			args = args || {};
			const is_dash =
				method.indexOf("number_card") >= 0 ||
				method.indexOf("dashboard_chart") >= 0 ||
				method === "frappe.desk.doctype.number_card.number_card.get_result" ||
				method === "frappe.desk.doctype.dashboard_chart.dashboard_chart.get" ||
				method === "ido_event.workspace_filters.get_number_card_result" ||
				method === "ido_event.workspace_filters.get_dashboard_chart";
			if (is_dash) {
				const ev = ido_event.workspace.get_selected();
				args.ido_event = ev || "";
			}
			return orig_xcall.call(this, method, args);
		};

		const orig_set_route = frappe.set_route;
		frappe.set_route = function () {
			const args = Array.prototype.slice.call(arguments);
			const ev = ido_event.workspace.get_selected();
			if (
				ev &&
				args[0] === "List" &&
				typeof args[1] === "string" &&
				args[1].indexOf("IDO ") === 0
			) {
				frappe.route_options = frappe.route_options || {};
				if (!frappe.route_options.event && !frappe.route_options.guest) {
					frappe.route_options.event = ev;
				}
			}
			return orig_set_route.apply(this, args);
		};
	};

	function boot() {
		ido_event.workspace.patch_widgets();
		ido_event.workspace.selected = localStorage.getItem(STORAGE_KEY);
		const try_inject = () => {
			if (is_ido_workspace()) {
				ido_event.workspace.inject_picker();
			} else {
				$("#ido-workspace-event-bar").remove();
			}
		};
		try_inject();
		frappe.router.on("change", () => setTimeout(try_inject, 200));
		$(document).on("page-change", () => setTimeout(try_inject, 300));
	}

	$(boot);
})();
