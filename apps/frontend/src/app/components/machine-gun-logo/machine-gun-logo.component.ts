import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-machine-gun-logo',
  imports: [CommonModule],
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      class="w-full h-full drop-shadow-[0_0_8px_rgba(79,70,229,0.3)]"
    >
      <!-- Gun Body -->
      <path d="M4 12h12v6H4z" fill="var(--brand-primary)" rx="1" />
      <path d="M4 18h4v4H4z" fill="var(--brand-primary)" rx="1" />

      <!-- Bullet -->
      <rect
        x="22"
        y="13"
        width="6"
        height="4"
        rx="2"
        fill="var(--brand-accent)"
        class="animate-pulse"
      />

      <!-- Fragments / Data Tracer -->
      <rect x="18" y="12" width="2" height="2" fill="var(--brand-accent)" opacity="0.6">
        <animate attributeName="x" from="16" to="32" dur="0.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.6" to="0" dur="0.8s" repeatCount="indefinite" />
      </rect>
      <rect x="18" y="16" width="2" height="2" fill="var(--brand-accent)" opacity="0.4">
        <animate attributeName="x" from="16" to="32" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.4" to="0" dur="1.2s" repeatCount="indefinite" />
      </rect>
    </svg>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class MachineGunLogoComponent {}
