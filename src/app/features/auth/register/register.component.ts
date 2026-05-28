import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['../login/login.component.scss']
})
export class RegisterComponent {
  username = '';
  password = '';
  confirmPassword = '';
  email = '';
  isLoading = false;
  showPassword = false;

  constructor(private auth: AuthService, private router: Router, private toastr: ToastrService) {}

  submit(): void {
    if (!this.username || !this.password || !this.email) {
      this.toastr.warning('Vui lòng điền đầy đủ thông tin');
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.toastr.error('Mật khẩu xác nhận không khớp');
      return;
    }
    this.isLoading = true;
    this.auth.register({ userName: this.username, firstName: this.username, lastName: '', password: this.password, email: this.email }).subscribe({
      next: () => {
        this.toastr.success('Đăng ký thành công! Vui lòng đăng nhập.');
        this.router.navigate(['/auth/login']);
      },
      error: () => { this.isLoading = false; this.toastr.error('Đăng ký thất bại. Tên đăng nhập hoặc email đã tồn tại.'); }
    });
  }
}
