import { Injectable } from '@nestjs/common';

@Injectable()
export class HelloCommand {
    async execute(): Promise<void> {
        console.log('🌟 Hello 40Swap world! 🌟');
    }
}
