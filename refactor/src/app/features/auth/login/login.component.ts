import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  username = '';
  password = '';
  isLoading = false;
  showPassword = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private toastr: ToastrService
  ) {}

  submit(): void {
    if (!this.username || !this.password) {
      this.toastr.warning('Vui lòng điền đầy đủ thông tin');
      return;
    }
    this.isLoading = true;
    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        this.toastr.success('Đăng nhập thành công!');
        this.router.navigate(['/']);
      },
      error: () => {
        this.isLoading = false;
        this.toastr.error('Tên đăng nhập hoặc mật khẩu không đúng');
      }
    });
  }
}
