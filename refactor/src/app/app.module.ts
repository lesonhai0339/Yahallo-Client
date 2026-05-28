import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ToastrModule } from 'ngx-toastr';
import { CookieService } from 'ngx-cookie-service';
import { CommonModule } from '@angular/common';

import { RouterModule } from '@angular/router';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

// Layout
import { HeaderComponent } from './layout/header/header.component';
import { FooterComponent } from './layout/footer/footer.component';

// Shared
import { MangaCardComponent } from './shared/components/manga-card/manga-card.component';
import { LoadingSkeletonComponent } from './shared/components/loading-skeleton/loading-skeleton.component';
import { ImageFallbackDirective } from './shared/directives/image-fallback.directive';
import { TranslatePipe } from './shared/pipes/translate.pipe';
import { FormatTextPipe } from './shared/pipes/format-text.pipe';
import { CommentEditorComponent } from './shared/components/comment-editor/comment-editor.component';
import { CommentItemComponent } from './shared/components/comment-item/comment-item.component';
import { CommentSectionComponent } from './shared/components/comment-section/comment-section.component';

// Features
import { HomeComponent } from './features/home/home.component';
import { MangaDetailComponent } from './features/manga/manga-detail/manga-detail.component';
import { MangaReaderComponent } from './features/manga/manga-reader/manga-reader.component';
import { MangaSearchComponent } from './features/manga/manga-search/manga-search.component';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { ForgotPasswordComponent } from './features/auth/forgot-password/forgot-password.component';
import { ProfileComponent } from './features/user/profile/profile.component';
import { NotificationsComponent } from './features/user/notifications/notifications.component';
import { ArtistListComponent } from './features/artist/artist-list/artist-list.component';
import { AuthorListComponent } from './features/author/author-list/author-list.component';

// Core
import { AuthInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';
import { TranslationService } from './core/services/translation.service';

export function initAuth(auth: AuthService) {
  return () => auth.init();
}

export function initTranslations(translation: TranslationService) {
  return () => translation.preloadAll();
}

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    FooterComponent,
    MangaCardComponent,
    LoadingSkeletonComponent,
    ImageFallbackDirective,
    TranslatePipe,
    FormatTextPipe,
    CommentEditorComponent,
    CommentItemComponent,
    CommentSectionComponent,
    HomeComponent,
    MangaDetailComponent,
    MangaReaderComponent,
    MangaSearchComponent,
    LoginComponent,
    RegisterComponent,
    ForgotPasswordComponent,
    ProfileComponent,
    NotificationsComponent,
    ArtistListComponent,
    AuthorListComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    RouterModule,
    AppRoutingModule,
    ToastrModule.forRoot({
      progressBar: true,
      progressAnimation: 'decreasing',
      timeOut: 3000,
      closeButton: true,
      positionClass: 'toast-bottom-right',
    }),
  ],
  providers: [
    CookieService,
    AuthService,
    TranslationService,
    {
      // translations must load before auth (auth runs first in array but both are parallel)
      provide: APP_INITIALIZER,
      useFactory: initTranslations,
      multi: true,
      deps: [TranslationService]
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initAuth,
      multi: true,
      deps: [AuthService]
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
