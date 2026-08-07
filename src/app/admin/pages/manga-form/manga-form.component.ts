import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AdminMangaService } from '../../services/admin-manga.service';
import {
  MANGA_STATUS_OPTIONS, MANGA_TYPE_OPTIONS, MANGA_LEVEL_OPTIONS, COUNTRY_OPTIONS,
  MangaStatus, MangaType, MangaLevel, Countries,
} from '../../../core/models/manga-enums';

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

  // Lấy từ core/models/manga-enums.ts — phản chiếu enum thật của backend.
  // Danh sách tự chế trước đây gửi lên giá trị không parse được (xem file đó).
  statusOptions = MANGA_STATUS_OPTIONS;
  typeOptions = MANGA_TYPE_OPTIONS;
  levelOptions = MANGA_LEVEL_OPTIONS;
  countriesOptions = COUNTRY_OPTIONS;

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
      // Giá trị SỐ đúng enum backend, không phải chuỗi tên tự đặt.
      type: [MangaType.Series],
      status: [MangaStatus.Active],
      level: [MangaLevel.Normal],
      countries: [Countries.JP],
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
            // API trả số (hoặc chuỗi số) — ép về number để khớp [value] của
            // <option>, nếu không select sẽ không chọn đúng mục nào.
            type: Number(m.type ?? MangaType.Series),
            status: Number(m.status ?? MangaStatus.Active),
            level: Number(m.level ?? MangaLevel.Normal),
            countries: Number(m.countries ?? Countries.JP),
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
    // Enum backend nhận số — String() ở đây chỉ là yêu cầu của FormData.
    fd.append('Type', String(v.type));
    fd.append('Status', String(v.status));
    fd.append('Level', String(v.level));
    fd.append('Countries', String(v.countries));
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
