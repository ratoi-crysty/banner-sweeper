import { Module } from '@nestjs/common';
import { BrowserModule } from '../browser/browser.module';
import { PlaywrightStockCheck } from './playwright-stock-check';
import { PublishedRuleSource } from './published-rule-source';
import { StockCheck } from './stock-check';

@Module({
  imports: [BrowserModule],
  providers: [
    PublishedRuleSource,
    { provide: StockCheck, useClass: PlaywrightStockCheck },
  ],
  exports: [StockCheck],
})
export class VerificationModule {}
