import { Component } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../core/services/auth.service';
import { TranslationService } from '../../../core/services/translation.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['../login/login.component.scss']
})
export class ForgotPasswordComponent {
  email = '';
  isLoading = false;
  sent = false;

  constructor(
    private auth: AuthService,
    private toastr: ToastrService,
    public t: TranslationService
  ) {}

  submit(): void {
    if (!this.email) { this.toastr.warning(this.t.get('AUTH.EMAIL_PLACEHOLDER')); return; }
    this.isLoading = true;
    this.auth.forgotPassword(this.email).subscribe({
      next: () => { this.isLoading = false; this.sent = true; },
      error: () => { this.isLoading = false; this.toastr.error(this.t.get('COMMON.ERROR')); }
    });
  }
}
