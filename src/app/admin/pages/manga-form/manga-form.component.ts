import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AdminMangaService } from '../../services/admin-manga.service';

@Component({
  selector: 'app-manga-form',
  templateUrl: './manga-form.component.html',
  styleUrls: ['./manga-form.component.scss']
})
export class MangaFormComponent implements OnInit {
  form!: FormGroup;
  mangaId: string | null = null;
  isEdit = false;
  loading = false;
  saving = false;
  previewImage: string | null = null;
  imageFile: File | null = null;

  allTags: any[] = [];
  allAuthors: any[] = [];
  allArtists: any[] = [];

  // Flat { id, name } arrays for MultiTagSelectComponent — set once after data loads
  tagItems:    { id: string; name: string }[] = [];
  authorItems: { id: string; name: string }[] = [];
  artistItems: { id: string; name: string }[] = [];

  // Selected IDs — managed by MultiTagSelectComponent
  selectedTagIds:    string[] = [];
  selectedAuthorIds: string[] = [];
  selectedArtistIds: string[] = [];

  // Linked series/seasons — managed by RelatedMangaSelectorComponent
  linkedMangas: any[] = [];

  statusOptions = [
    { value: 'Ongoing', label: 'Đang ra' },
    { value: 'Completed', label: 'Hoàn thành' },
    { value: 'Hiatus', label: 'Tạm dừng' },
    { value: 'Hidden', label: 'Ẩn' },
  ];

  typeOptions = [
    { value: 'Manga', label: 'Manga (Nhật)' },
    { value: 'Manhwa', label: 'Manhwa (Hàn)' },
    { value: 'Manhua', label: 'Manhua (Trung)' },
  ];

  levelOptions = [
    { value: '0', label: 'Mọi độ tuổi' },
    { value: '1', label: '13+' },
    { value: '2', label: '16+' },
    { value: '3', label: '18+' },
  ];

  countriesOptions = [
    { value: '0', label: 'Nhật Bản' },
    { value: '1', label: 'Hàn Quốc' },
    { value: '2', label: 'Trung Quốc' },
    { value: '3', label: 'Khác' },
  ];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private mangaService: AdminMangaService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      type: ['Manga'],
      status: ['Ongoing'],
      level: ['0'],
      countries: ['0'],
      season: [1, [Validators.min(1)]],
    });

    this.mangaId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.mangaId;

    this.loading = true;
    const loaders: any = {
      tags: this.mangaService.getAllTags(),
      authors: this.mangaService.getAllAuthors(),
      artists: this.mangaService.getAllArtists(),
    };
    if (this.isEdit) {
      loaders.manga = this.mangaService.getDetail(this.mangaId!);
    }

    forkJoin(loaders).subscribe({
      next: (results: any) => {
        const tagsRaw = results.tags?.value ?? results.tags ?? [];
        this.allTags = Array.isArray(tagsRaw) ? tagsRaw : [];
        this.tagItems = this.allTags.map(t => ({ id: t.id, name: t.name }));

        const authorsData = results.authors?.value ?? results.authors;
        this.allAuthors = authorsData?.data ?? authorsData?.items ?? (Array.isArray(authorsData) ? authorsData : []);
        this.authorItems = this.allAuthors.map(a => ({ id: a.id, name: a.name }));

        const artistsData = results.artists?.value ?? results.artists;
        this.allArtists = artistsData?.data ?? artistsData?.items ?? (Array.isArray(artistsData) ? artistsData : []);
        this.artistItems = this.allArtists.map(a => ({ id: a.id, name: a.name }));

        if (this.isEdit && results.manga) {
          const m = results.manga?.value ?? results.manga;
          this.form.patchValue({
            name: m.name,
            description: m.description,
            type: m.type,
            status: m.status,
            level: String(m.level ?? '0'),
            countries: String(m.countries ?? '0'),
            season: m.season ?? 1,
          });
          // Populate multi-select selections
          this.selectedTagIds    = (m.tags    ?? []).map((t: any) => t.id);
          this.selectedAuthorIds = (m.authors ?? []).map((a: any) => a.id);
          this.selectedArtistIds = (m.artists ?? []).map((a: any) => a.id);
          if (m.thumbnail) this.previewImage = this.mangaService.imgUrl(m.thumbnail);
        }
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.imageFile = input.files[0];
      const reader = new FileReader();
      reader.onload = e => { this.previewImage = e.target?.result as string; };
      reader.readAsDataURL(this.imageFile);
    }
  }

  // ── Handlers from MultiTagSelectComponent ──────────────────────────────────
  onTagsChange(ids: string[])    { this.selectedTagIds    = ids; }
  onAuthorsChange(ids: string[]) { this.selectedAuthorIds = ids; }
  onArtistsChange(ids: string[]) { this.selectedArtistIds = ids; }

  buildFormData(): FormData {
    const fd = new FormData();
    const v = this.form.value;
    fd.append('Name', v.name);
    fd.append('Description', v.description ?? '');
    fd.append('Type', v.type);
    fd.append('Status', v.status);
    fd.append('Level', v.level);
    fd.append('Countries', v.countries);
    fd.append('Season', String(v.season ?? 1));
    this.selectedTagIds.forEach(id    => fd.append('TagIds',    id));
    this.selectedAuthorIds.forEach(id => fd.append('AuthorIds', id));
    this.selectedArtistIds.forEach(id => fd.append('ArtistIds', id));
    if (this.imageFile) fd.append('Thumbnail', this.imageFile, this.imageFile.name);
    return fd;
  }

  save(): void {
    if (this.form.invalid) return;
    this.saving = true;
    const fd = this.buildFormData();
    const req = this.isEdit
      ? this.mangaService.update(this.mangaId!, fd)
      : this.mangaService.create(fd);

    req.subscribe({
      next: (res: any) => {
        const newId = res?.value?.id ?? res?.id ?? this.mangaId;
        // Link related series if any selected
        if (newId && this.linkedMangas.length > 0) {
          const targetIds = this.linkedMangas.map(m => m.id);
          this.mangaService.linkSeries(newId, targetIds).subscribe({
            error: () => this.toastr.warning('Lưu liên kết series thất bại (API chưa có)')
          });
        }
        this.toastr.success(this.isEdit ? 'Cập nhật thành công' : 'Tạo truyện thành công');
        this.backToOrigin(newId);
      },
      error: () => {
        this.toastr.error('Có lỗi xảy ra');
        this.saving = false;
      }
    });
  }

  cancel(): void {
    this.backToOrigin();
  }

  /**
   * Chức năng: Rời form về đúng nơi hợp lý — sửa truyện thì về trang thông tin
   *   của chính truyện đó, tạo mới thì về trang thông tin của truyện vừa tạo,
   *   không có id nào thì về danh sách.
   * Yêu cầu: `id` là id truyện vừa tạo (chỉ truyền khi lưu xong).
   * Kết quả trả về: không (điều hướng).
   * Exception: không ném.
   */
  private backToOrigin(id?: string | null): void {
    const target = id ?? this.mangaId;
    if (target) this.router.navigate(['/admin/manga', target, 'info']);
    else this.router.navigate(['/admin/manga']);
  }
}
