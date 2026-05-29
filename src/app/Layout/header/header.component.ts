import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { MangaService } from '../../core/services/manga.service';
import { NotificationService } from '../../core/services/notification.service';
import { UserInteractionService } from '../../core/services/user-interaction.service';
import { TranslationService, SupportedLang } from '../../core/services/translation.service';
import { ThemeService } from '../../core/services/theme.service';
import { User } from '../../core/models/interfaces';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInputRef!: ElementRef;

  isDropdownOpen = false;
  closeTimer: any;
  isScrolled = false;
  isMenuOpen = false;
  isSearchOpen = false;
  isNotifOpen = false;
  isUserMenuOpen = false;
  isLangOpen = false;

  user: User | null = null;
  isLoggedIn = false;
  searchQuery = '';
  searchResults: any[] = [];
  notifications: any[] = [];
  unreadCount = 0;
  categories: any[] = [];

  availableLangs: SupportedLang[] = [];
  currentLang: SupportedLang = 'vi';

  readonly langLabels: Record<SupportedLang, { label: string; flag: string }> = {
    vi: { label: 'VI', flag: '🇻🇳' },
    en: { label: 'EN', flag: '🇬🇧' },
  };

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private auth: AuthService,
    private mangaService: MangaService,
    private notifService: NotificationService,
    private userInteraction: UserInteractionService,
    public translation: TranslationService,
    public themeService: ThemeService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.availableLangs = this.translation.getAvailableLangs();
    this.currentLang = this.translation.currentLang;
    this.translation.lang$.pipe(takeUntil(this.destroy$)).subscribe(l => this.currentLang = l);

    this.auth.auth$.pipe(takeUntil(this.destroy$)).subscribe(state => {
      this.isLoggedIn = state.status;
      this.user = this.auth.currentUser;
      if (state.status && this.user) {
        this.loadNotifications();
        this.notifService.startHub();
      }
    });

    this.notifService.unreadCount.pipe(takeUntil(this.destroy$)).subscribe(c => this.unreadCount = c);
    this.notifService.notifications.pipe(takeUntil(this.destroy$)).subscribe(n => this.notifications = n.slice(0, 8));

    this.mangaService.getCategories().pipe(takeUntil(this.destroy$)).subscribe(cats => this.categories = cats || []);

    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => q.length > 1 ? this.mangaService.search(q) : []),
      takeUntil(this.destroy$)
    ).subscribe(results => this.searchResults = (results as any[]).slice(0, 6));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.isScrolled = window.scrollY > 50;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.notif-wrapper')) this.isNotifOpen = false;
    if (!target.closest('.user-menu-wrapper')) this.isUserMenuOpen = false;
    if (!target.closest('.search-wrapper')) { this.isSearchOpen = false; this.searchResults = []; }
    if (!target.closest('.lang-wrapper')) this.isLangOpen = false;
  }

  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  submitSearch(): void {
    if (this.searchQuery.trim()) {
      this.router.navigate(['/search'], { queryParams: { q: this.searchQuery.trim() } });
      this.searchResults = [];
      this.isSearchOpen = false;
    }
  }

  goToManga(item: any): void {
    this.router.navigate(['/manga', item.mangaId, encodeURIComponent(item.mangaName)]);
    this.searchResults = [];
    this.searchQuery = '';
  }

  loadNotifications(): void {
    if (!this.user) return;
    this.userInteraction.getUnreadNotifications(this.user.id).subscribe(notifs => {
      this.notifService.setNotifications(notifs as any);
    });
  }

  openNotif(item: any): void {
    this.userInteraction.markNotificationRead(item.id).subscribe();
    this.notifService.decrementUnread();
    if (item.idTarget) this.router.navigate(['/manga', item.idTarget, item.target]);
    this.isNotifOpen = false;
  }

  switchLang(lang: SupportedLang): void {
    this.translation.setLanguage(lang);
    this.isLangOpen = false;
  }

  logout(): void {
    this.auth.logout();
    this.notifService.stopHub();
    this.router.navigate(['/']);
  }
  t(key: string): string {
    return this.translation.get(key);
  }
}
