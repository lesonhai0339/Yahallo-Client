import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Observable } from 'rxjs';
import { TaxonomyService, TaxonomyRequest, TaxonomyType } from '../../services/taxonomy.service';

@Component({
  selector: 'app-taxonomy-requests',
  templateUrl: './taxonomy-requests.component.html',
  styleUrls: ['./taxonomy-requests.component.scss'],
})
export class TaxonomyRequestsComponent implements OnInit {
  requests$!: Observable<TaxonomyRequest[]>;
  filter: 'pending' | 'all' = 'pending';
  processing: Record<string, boolean> = {};

  constructor(private taxonomy: TaxonomyService, private toastr: ToastrService) {}

  ngOnInit(): void {
    this.requests$ = this.taxonomy.requests$;
  }

  visible(list: TaxonomyRequest[] | null): TaxonomyRequest[] {
    const all = list ?? [];
    return this.filter === 'all' ? all : all.filter(r => r.status === 'pending');
  }

  typeLabel(type: TaxonomyType): string {
    return type === 'tag' ? 'Tag' : type === 'author' ? 'Tác giả' : 'Họa sĩ';
  }

  summary(req: TaxonomyRequest): string {
    const p = req.payload || {};
    const parts = [p.name];
    if (req.type !== 'tag') {
      if (p.depscription) parts.push(p.depscription);
      const country = p.countryCode ?? p.countries;
      if (country != null) parts.push('QG ' + country);
    } else if (p.description) {
      parts.push(p.description);
    }
    return parts.filter(Boolean).join(' · ');
  }

  approve(req: TaxonomyRequest): void {
    if (this.processing[req.id]) return;
    this.processing[req.id] = true;
    this.taxonomy.approveRequest(req.id).subscribe({
      next: () => { this.processing[req.id] = false; this.toastr.success('Đã duyệt và thêm vào hệ thống'); },
      error: () => { this.processing[req.id] = false; this.toastr.error('Không thể duyệt (tạo thất bại)'); },
    });
  }

  reject(req: TaxonomyRequest): void {
    if (this.processing[req.id]) return;
    this.processing[req.id] = true;
    this.taxonomy.rejectRequest(req.id).subscribe(() => {
      this.processing[req.id] = false;
      this.toastr.info('Đã từ chối yêu cầu');
    });
  }
}
