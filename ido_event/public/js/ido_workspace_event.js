/*!
 * IDO Event workspace picker — filters Number Cards / Charts / list routes
 * by the selected IDO Event.
 */
frappe.provide("ido_event.workspace");

(function () {
	const STORAGE_KEY = "ido_selected_event";
	const WORKSPACES = new Set(["IDO Events", "IDO Play", "الفعاليات"]);
	const BAR_ID = "ido-workspace-event-bar";
	const MAX_INJECT_ATTEMPTS = 25;

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
		_inject_timer: null,
		_inject_attempts: 0,
		_observer: null,
	};

	function route_workspace_name() {
		const route = frappe.get_route();
		if (!route || !route.length) return null;
		if (route[0] === "Workspaces" || route[0] === "workspace") {
			// ["Workspaces", "IDO Events"] or ["Workspaces", "private", "My Page"]
			if (route[1] === "private") return route[2] || null;
			return route[1] || null;
		}
		return null;
	}

	function looks_like_ido_name(name) {
		if (!name) return false;
		if (WORKSPACES.has(name)) return true;
		const n = String(name);
		const lower = n.toLowerCase().replace(/_/g, " ").replace(/-/g, " ");
		return (
			n.indexOf("IDO") === 0 ||
			lower.indexOf("ido event") >= 0 ||
			lower === "ido events" ||
			lower === "ido play" ||
			n.indexOf("فعالية") >= 0 ||
			n.indexOf("الفعاليات") >= 0
		);
	}

	function sidebar_title() {
		try {
			const from_attr = ($(".body-sidebar").attr("data-title") || "").trim();
			if (from_attr) return from_attr;
			return (frappe.app && frappe.app.sidebar && frappe.app.sidebar.sidebar_title) || "";
		} catch (e) {
			return "";
		}
	}

	function is_ido_doctype_route() {
		const route = frappe.get_route() || [];
		if (!route.length) return false;
		if (route[0] === "List" || route[0] === "Form" || route[0] === "Tree") {
			return String(route[1] || "").indexOf("IDO ") === 0;
		}
		if (route[0] === "dashboard-view" || route[0] === "Dashboard") {
			return String(route[1] || "").indexOf("IDO ") === 0;
		}
		return false;
	}

	function is_ido_workspace() {
		const name = route_workspace_name();
		if (looks_like_ido_name(name)) return true;
		if (looks_like_ido_name(sidebar_title())) return true;
		return false;
	}

	function should_show_picker() {
		return is_ido_workspace() || is_ido_doctype_route();
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

	function find_inject_host() {
		const $editor = $("#editorjs, .codex-editor").first();
		if ($editor.length) {
			return { $el: $editor, mode: "before" };
		}

		const $container = $(".editor-js-container").first();
		if ($container.length) {
			return { $el: $container, mode: "prepend" };
		}

		const $ws = $(".workspace-body, .desk-page.page-main-content").first();
		if ($ws.length) {
			return { $el: $ws, mode: "prepend" };
		}

		const $section = $(".layout-main-section").first();
		if ($section.length) {
			return { $el: $section, mode: "prepend" };
		}

		const $head = $(".page-head .page-head-content").first();
		if ($head.length) {
			return { $el: $head, mode: "append" };
		}

		return null;
	}

	function bar_is_mounted() {
		const $bar = $("#" + BAR_ID);
		if (!$bar.length) return false;
		// Detached / replaced by workspace re-render
		if (!document.body.contains($bar[0])) return false;
		return true;
	}

	function build_bar() {
		return $(`
			<div id="${BAR_ID}" class="ido-event-bar" role="region" aria-label="${__(
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
	}

	function bind_bar_events() {
		$("#ido-workspace-event-btn")
			.off("click.ido_event")
			.on("click.ido_event", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const $picker = $("#ido-workspace-event-picker");
				const open = !$picker.hasClass("is-open");
				$(".ido-event-picker").removeClass("is-open");
				$picker.toggleClass("is-open", open);
				$(this).attr("aria-expanded", open ? "true" : "false");
			});

		$("#ido-workspace-event-menu")
			.off("click.ido_event")
			.on("click.ido_event", ".ido-event-picker__item", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const val = $(this).attr("data-event") || "";
				ido_event.workspace.set_selected(val || null);
			});

		$("#ido-workspace-event-clear")
			.off("click.ido_event")
			.on("click.ido_event", function (e) {
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

	async function load_events_into_bar() {
		try {
			const res = await frappe.xcall("ido_event.workspace_filters.list_events");
			ido_event.workspace.events = (res && res.events) || [];
			if (!ido_event.workspace.selected) {
				ido_event.workspace.selected =
					localStorage.getItem(STORAGE_KEY) || (res && res.selected) || null;
			}
			ido_event.workspace.update_label();
		} catch (e) {
			console.warn("ido_event list_events", e);
		}
	}

	ido_event.workspace.inject_picker = async function () {
		if (!should_show_picker()) {
			$("#" + BAR_ID).remove();
			ido_event.workspace._inject_attempts = 0;
			return false;
		}

		const host = find_inject_host();
		if (!host) {
			return false;
		}

		if (!bar_is_mounted()) {
			$("#" + BAR_ID).remove();
			const bar = build_bar();
			if (host.mode === "before") {
				bar.insertBefore(host.$el);
			} else if (host.mode === "append") {
				host.$el.append(bar);
			} else {
				host.$el.prepend(bar);
			}
			bind_bar_events();
		}

		await load_events_into_bar();
		ido_event.workspace._inject_attempts = 0;
		return true;
	};

	function schedule_inject(delay) {
		if (ido_event.workspace._inject_timer) {
			clearTimeout(ido_event.workspace._inject_timer);
		}
		ido_event.workspace._inject_timer = setTimeout(async () => {
			ido_event.workspace._inject_timer = null;
			const ok = await ido_event.workspace.inject_picker();
			if (ok || !should_show_picker()) return;

			ido_event.workspace._inject_attempts += 1;
			if (ido_event.workspace._inject_attempts < MAX_INJECT_ATTEMPTS) {
				schedule_inject(200);
			}
		}, delay || 0);
	}

	function watch_dom_for_host() {
		if (ido_event.workspace._observer) return;
		if (typeof MutationObserver === "undefined") return;

		ido_event.workspace._observer = new MutationObserver(() => {
			if (!should_show_picker()) return;
			if (bar_is_mounted()) return;
			if (find_inject_host()) {
				schedule_inject(50);
			}
		});
		ido_event.workspace._observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

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

	function on_route_or_page() {
		ido_event.workspace._inject_attempts = 0;
		if (should_show_picker()) {
			schedule_inject(150);
			schedule_inject(500);
			schedule_inject(1200);
		} else {
			$("#" + BAR_ID).remove();
		}
	}

	function boot() {
		ido_event.workspace.patch_widgets();
		ido_event.workspace.selected = localStorage.getItem(STORAGE_KEY);
		watch_dom_for_host();
		on_route_or_page();

		if (frappe.router && typeof frappe.router.on === "function") {
			frappe.router.on("change", on_route_or_page);
		}
		$(document).on("page-change", on_route_or_page);
	}

	if (window.frappe && frappe.ready) {
		frappe.ready(boot);
	} else {
		$(boot);
	}
	// Desk sometimes loads app_include after first paint
	$(document).on("app_ready", boot);
})();
