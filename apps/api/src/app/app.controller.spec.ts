import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  it('answers through the service Nest injects', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    const controller: AppController = moduleRef.get(AppController);

    expect(controller.getData()).toEqual({ message: 'Hello API' });
  });
});
