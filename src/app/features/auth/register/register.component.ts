import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../core/services/auth.service';
import { CountryService } from '../../../core/services/country.service';
import { Country } from '../../../core/models/country.interface';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['../login/login.component.scss', './register.component.scss']
})
export class RegisterComponent implements OnInit {
  firstName = '';
  lastName = '';
  email = '';
  phoneNumber = '';
  username = '';
  password = '';
  confirmPassword = '';
  isLoading = false;
  showPassword = false;
  showConfirmPassword = false;
  selectedAvatar: File | null = null;
  avatarPreviewUrl: string | null = null;
  selectedBackground: File | null = null;
  backgroundPreviewUrl: string | null = null;

  // ── Country / phone code ──────────────────────────────────────────────
  countries: Country[] = [];
  selectedCountry: Country | null = null;
  countryDropdownOpen = false;
  highlightedIndex = 0;
  loadingCountries = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private toastr: ToastrService,
    private countryService: CountryService,
    private el: ElementRef
  ) {}

  ngOnInit(): void {
    this.loadingCountries = true;
    this.countryService.getCountries().subscribe({
      next: (list) => {
        this.countries = list;
        // Mặc định chọn Việt Nam (+84), nếu không có thì lấy phần tử đầu.
        this.selectedCountry = list.find(c => c.name === 'VN') ?? list[0] ?? null;
        this.loadingCountries = false;
      },
      error: () => { this.loadingCountries = false; }
    });
  }

  /** URL ảnh cờ quốc gia (flagcdn) — dùng ảnh vì Windows không render emoji cờ. */
  flagUrl(iso: string): string {
    return `https://flagcdn.com/h20/${iso.toLowerCase()}.png`;
  }

  // ── Dropdown handlers ─────────────────────────────────────────────────
  toggleCountryDropdown(): void {
    this.countryDropdownOpen ? this.closeDropdown() : this.openDropdown();
  }

  openDropdown(): void {
    if (this.loadingCountries) return;
    this.countryDropdownOpen = true;
    const idx = this.countries.findIndex(c => c.code === this.selectedCountry?.code);
    this.highlightedIndex = idx >= 0 ? idx : 0;
    this.scrollHighlightedIntoView();
  }

  closeDropdown(): void {
    this.countryDropdownOpen = false;
  }

  // Dùng mousedown ở template để chọn trước khi trigger mất focus.
  selectCountry(country: Country): void {
    this.selectedCountry = country;
    this.closeDropdown();
  }

  /** Bàn phím: mở/đóng, di chuyển highlight, và typeahead theo chữ cái đầu. */
  onTriggerKeydown(event: KeyboardEvent): void {
    if (!this.countryDropdownOpen) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.openDropdown();
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        this.closeDropdown();
        return;
      case 'ArrowDown':
        event.preventDefault();
        this.moveHighlight(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.moveHighlight(-1);
        return;
      case 'Enter':
        event.preventDefault();
        if (this.countries[this.highlightedIndex]) this.selectCountry(this.countries[this.highlightedIndex]);
        return;
    }

    // Nhấn 1 chữ cái/số -> nhảy tới quốc gia có tên bắt đầu bằng ký tự đó (xoay vòng).
    if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) {
      event.preventDefault();
      this.typeahead(event.key.toLowerCase());
    }
  }

  private moveHighlight(delta: number): void {
    const n = this.countries.length;
    if (!n) return;
    this.highlightedIndex = (this.highlightedIndex + delta + n) % n;
    this.scrollHighlightedIntoView();
  }

  private typeahead(ch: string): void {
    const n = this.countries.length;
    for (let i = 1; i <= n; i++) {
      const idx = (this.highlightedIndex + i) % n;
      if (this.countries[idx].vietnameseName.toLowerCase().startsWith(ch)) {
        this.highlightedIndex = idx;
        this.scrollHighlightedIntoView();
        return;
      }
    }
  }

  private scrollHighlightedIntoView(): void {
    setTimeout(() => {
      const item = this.el.nativeElement.querySelector('.country-item.highlighted');
      item?.scrollIntoView({ block: 'nearest' });
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.countryDropdownOpen && !this.el.nativeElement.contains(event.target)) {
      this.closeDropdown();
    }
  }

  onFileSelected(event: any): void {
    const file = this.validateImage(event.target.files[0]);
    if (!file) return;
    this.selectedAvatar = file;
    this.avatarPreviewUrl = URL.createObjectURL(file);
  }

  onBackgroundSelected(event: any): void {
    const file = this.validateImage(event.target.files[0]);
    if (!file) return;
    this.selectedBackground = file;
    this.backgroundPreviewUrl = URL.createObjectURL(file);
  }

  /** Kiểm tra định dạng ảnh + dung lượng < 2MB. Trả về file hợp lệ hoặc null. */
  private validateImage(file: File | undefined): File | null {
    if (!file) return null;
    if (!file.type.startsWith('image/')) {
      this.toastr.error('Sai định dạng ảnh');
      return null;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.toastr.error('Kích thước file phải nhỏ hơn 2MB');
      return null;
    }
    return file;
  }

  submit(): void {
    if (!this.username || !this.password || !this.email || !this.firstName || !this.lastName || !this.phoneNumber) {
      this.toastr.warning('Vui lòng điền đầy đủ thông tin');
      return;
    }
    if (!this.selectedCountry) {
      this.toastr.warning('Vui lòng chọn mã quốc gia');
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.toastr.error('Mật khẩu xác nhận không khớp');
      return;
    }
    // Ghép mã quốc gia + số local, bỏ số 0 đầu (vd 0987... -> +84987...).
    const localNumber = this.phoneNumber.trim().replace(/\s/g, '').replace(/^0+/, '');
    const fullPhone = `+${this.selectedCountry.phoneCode}${localNumber}`;
    this.isLoading = true;
    this.auth.register({FirstName: this.firstName, LastName: this.lastName, Email: this.email, PhoneNumber: fullPhone, CountryId: String(this.selectedCountry.id), UserName: this.username, Password: this.password, Avatar: this.selectedAvatar, Background: this.selectedBackground }).subscribe({
      next: (res) => {
        if (res.uploadFailed) {
          this.toastr.warning('Tạo tài khoản thành công nhưng tải ảnh lên thất bại. Bạn có thể cập nhật ảnh sau.');
        } else {
          this.toastr.success(res.message);
        }
        this.router.navigate(['/auth/login']);
      },
      error: (err) => {
        const error = err?.error ?? err;
        const errMsg = `${error.status ?? ''} ${error.detail ?? 'Đăng ký thất bại'}`;
        this.isLoading = false;
        this.toastr.error(errMsg);
      }
    });
  }
}
