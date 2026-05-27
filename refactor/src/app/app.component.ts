import { Component, OnInit } from '@angular/core';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  template: `
    <app-header></app-header>
    <main>
      <router-outlet></router-outlet>
    </main>
    <app-footer></app-footer>
  `,
  styles: [`
    main { min-height: calc(100vh - 60px); }
  `]
})
export class AppComponent implements OnInit {
  constructor(private theme: ThemeService) {}
  ngOnInit(): void { this.theme.apply(); }
}
