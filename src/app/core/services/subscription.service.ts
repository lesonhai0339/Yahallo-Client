import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type SubscriptionPlan = 0 | 1 | 2;

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly base = environment.subscriptionApi;

  constructor(private http: HttpClient) {}

  create(plan: SubscriptionPlan, durationDays: number): Observable<any> {
    return this.http.post(`${this.base}/create`, { plan, durationDays });
  }
}
