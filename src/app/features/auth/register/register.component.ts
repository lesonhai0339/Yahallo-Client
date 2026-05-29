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

  constructor(private auth: AuthService, private router: Router, private toastr: ToastrService) {}

  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    if (file) {
      // You can add validation for file type and size here if needed
      // For example, to check if it's an image and less than 2MB:
      if (!file.type.startsWith('image/')) {
        this.toastr.error('Sai định dạng ảnh');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        this.toastr.error('Kích thước file phải nhỏ hơn 2MB');
        return;
      }
      // Store the selected file for later use during registration
      this.selectedAvatar = file;
      this.avatarPreviewUrl = URL.createObjectURL(file);
    }
  }

  submit(): void {
    if (!this.username || !this.password || !this.email || !this.firstName || !this.lastName || !this.phoneNumber) {
      this.toastr.warning('Vui lòng điền đầy đủ thông tin');
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.toastr.error('Mật khẩu xác nhận không khớp');
      return;
    }
    this.isLoading = true;
    this.auth.register({FirstName: this.firstName, LastName: this.lastName, Email: this.email, PhoneNumber: this.phoneNumber, UserName: this.username, Password: this.password, Avatar: this.selectedAvatar  }).subscribe({
      next: (repsonse) => {
        const res = repsonse?.value ?? repsonse;  
        this.toastr.success(res);
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
