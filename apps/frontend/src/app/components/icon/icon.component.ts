import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type IconName =
  | 'schema'
  | 'refresh'
  | 'close'
  | 'add'
  | 'remove'
  | 'play'
  | 'stop'
  | 'bolt'
  | 'edit'
  | 'delete'
  | 'upload'
  | 'save'
  | 'info'
  | 'uuid'
  | 'key'
  | 'warning'
  | 'string'
  | 'number'
  | 'timestamp'
  | 'timer'
  | 'expand'
  | 'shrink'
  | 'rabbitmq'
  | 'kafka'
  | 'server'
  | 'copy'
  | 'toggle'
  | 'queue'
  | 'exchange'
  | 'direct'
  | 'topic'
  | 'fanout'
  | 'headers'
  | 'route'
  | 'options'
  | 'regex'
  | 'expand_more'
  | 'expand_less'
  | 'folder'
  | 'check_circle'
  | 'chevron_right'
  | 'list'
  | 'analytics'
  | 'close_fullscreen'
  | 'data_array'
  | 'data_object'
  | 'account_tree'
  | 'map'
  | 'chevron_left'
  | 'menu'
  | 'menu_open'
  | 'help'
  | 'support'
  | 'example'
  | 'auto_awesome'
  | 'search'
  | 'explore'
  | 'search_off'
  | 'near_me'
  | 'history'
  | 'restart'
  | 'send'
  | 'swap_vert'
  | 'swap_horiz'
  | 'difference'
  | 'filter_list'
  | 'vertical_align_bottom'
  | 'vertical_align_top'
  | 'palette'
  | 'check'
  | 'terminal';

@Component({
  selector: 'app-icon',
  imports: [CommonModule],
  host: {
    '[style.display]': '"inline-flex"',
    '[style.align-items]': '"center"',
    '[style.justify-content]': '"center"',
    '[style.flex-shrink]': '"0"',
    '[style.width.px]': 'displaySize()',
    '[style.height.px]': 'displaySize()',
  },
  template: `
    @if (isCustomIcon()) {
      <svg
        xmlns="http://www.w3.org/2000/svg"
        [attr.viewBox]="viewBox()"
        shape-rendering="geometricPrecision"
        [attr.fill]="isSolid() ? 'currentColor' : 'none'"
        [attr.stroke]="isSolid() ? 'none' : 'currentColor'"
        [attr.stroke-width]="strokeWidth()"
        [style.width.px]="displaySize()"
        [style.height.px]="displaySize()"
        aria-hidden="true"
      >
        @for (path of paths(); track path) {
          <path [attr.d]="path" stroke-linecap="round" stroke-linejoin="round" />
        }
      </svg>
    } @else {
      <span
        class="material-symbols-outlined select-none"
        style="line-height: 1; user-select: none; font-optical-sizing: auto; -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision;"
        [style.font-size.px]="displaySize()"
        [style.color]="isSolid() ? 'currentColor' : 'inherit'"
        [style.font-variation-settings]="fontVariationSettings()"
        aria-hidden="true"
        >{{ materialSymbolName() }}</span
      >
    }
  `,
})
export class IconComponent {
  private static readonly MATERIAL_SYMBOL_MAP: Record<string, string> = {
    schema: 'schema',
    refresh: 'refresh',
    close: 'close',
    add: 'add',
    remove: 'remove',
    play: 'play_arrow',
    stop: 'stop',
    bolt: 'bolt',
    edit: 'edit',
    delete: 'delete',
    upload: 'upload',
    save: 'save',
    info: 'info',
    uuid: 'key',
    key: 'key',
    warning: 'warning',
    string: 'text_fields',
    number: 'numbers',
    timestamp: 'schedule',
    timer: 'timer',
    expand: 'open_in_full',
    shrink: 'close_fullscreen',
    server: 'dns',
    copy: 'content_copy',
    toggle: 'toggle_on',
    queue: 'toc',
    exchange: 'swap_horiz',
    direct: 'trending_flat',
    topic: 'hub',
    fanout: 'call_split',
    headers: 'list_alt',
    route: 'alt_route',
    options: 'tune',
    regex: 'regular_expression',
    expand_more: 'expand_more',
    check_circle: 'check_circle',
    chevron_right: 'chevron_right',
    list: 'list',
    analytics: 'analytics',
    close_fullscreen: 'close_fullscreen',
    data_array: 'data_array',
    data_object: 'data_object',
    account_tree: 'account_tree',
    map: 'map',
    chevron_left: 'chevron_left',
    menu: 'menu',
    menu_open: 'menu_open',
    help: 'help',
    support: 'support',
    example: 'explicit',
    auto_awesome: 'auto_awesome',
    search: 'search',
    explore: 'explore',
    search_off: 'search_off',
    near_me: 'near_me',
    history: 'history',
    restart: 'restart_alt',
    difference: 'difference',
    vertical_align_bottom: 'vertical_align_bottom',
    vertical_align_top: 'vertical_align_top',
    palette: 'palette',
    check: 'check',
    terminal: 'terminal',
    rabbitmq: 'cruelty_free',
    kafka: 'lan',
  };

  public readonly name = input.required<IconName>();
  public readonly variant = input<'outline' | 'solid'>('outline');
  public readonly size = input<number>(20);

  protected readonly displaySize = computed(() => Math.max(12, this.size()));
  protected readonly isSolid = computed(() => this.variant() === 'solid');
  protected readonly isCustomIcon = computed(() => false);
  protected readonly viewBox = computed(() => '0 0 24 24');
  protected readonly strokeWidth = computed(() => (this.isSolid() ? '0' : '1.5'));

  protected readonly fontVariationSettings = computed(() => {
    const fill = this.isSolid() ? 1 : 0;
    const opticalSize = Math.max(20, Math.min(48, this.displaySize()));
    return `"FILL" ${fill}, "wght" 400, "GRAD" 0, "opsz" ${opticalSize}`;
  });

  protected readonly materialSymbolName = computed(() => {
    return IconComponent.MATERIAL_SYMBOL_MAP[this.name()] || this.name();
  });

  protected readonly paths = computed(() => {
    const iconName = this.name();
    const isSolid = this.isSolid();

    const customIcons: Record<string, { outline: string[]; solid: string[] }> = {};

    const icon = customIcons[iconName];
    if (!icon) return [];

    return isSolid ? icon.solid : icon.outline;
  });
}
