import {BaseFrame, FrameType} from '../../frame/base.frame';
import {Bignum} from '../../types/bignum';
import {VLIE, VLIEOffset} from '../../crypto/vlie';
import {RstStreamFrame} from '../../frame/rst.stream';
import {ApplicationCloseFrame, ConnectionCloseFrame} from '../../frame/close';
import {MaxDataFrame} from '../../frame/max.data';
import {MaxStreamFrame} from '../../frame/max.stream';
import {MaxStreamIdFrame} from '../../frame/max.stream.id';
import {PingFrame} from '../../frame/ping';
import {BlockedFrame} from '../../frame/blocked';
import {StreamBlockedFrame} from '../../frame/stream.blocked';
import {StreamIdBlockedFrame} from '../../frame/stream.id.blocked';
import {ConnectionID} from '../../packet/header/header.properties';
import {NewConnectionIdFrame} from '../../frame/new.connection.id';
import {StopSendingFrame} from '../../frame/stop.sending';
import {StreamFrame} from '../../frame/stream';
import { AckBlock, AckFrame } from '../../frame/ack';
import { PaddingFrame } from '../../frame/padding';
import { ConnectionErrorCodes } from '../errors/quic.codes';
import { QuicError } from '../errors/connection.error';
import { FrameFactory } from '../factories/frame.factory';
import { Constants } from '../constants';
import { VerboseLogging } from '../logging/verbose.logging';


export class FrameParser {

    public parse(msg: Buffer, offset: number): BaseFrame[] {
        VerboseLogging.trace("FrameParser:parse : full decrypted hex of all frames together : " + msg.toString('hex'));
        
        var frames: BaseFrame[] = [];

        var frameOffset: FrameOffset | undefined = this.parseFrame(msg, offset);
        while (frameOffset !== undefined) {
            frames.push(frameOffset.frame);
            frameOffset = this.parseFrame(msg, frameOffset.offset);
        }

        return frames;
    }


    private parseFrame(buffer: Buffer, offset: number): FrameOffset | undefined {
        if (buffer.byteLength <= offset) {
            return undefined;
        }
        var type = buffer.readUInt8(offset++);
        VerboseLogging.trace("FrameParser:ParseFrame : type=" + FrameType[type] + ", length=" + buffer.byteLength);
        switch (type) {
            case FrameType.PADDING:
                return this.parsePadding(buffer, offset);
            case FrameType.RST_STREAM:
                return this.parseRstStream(buffer, offset);
            case FrameType.CONNECTION_CLOSE:
                return this.parseClose(FrameType.CONNECTION_CLOSE, buffer, offset);
            case FrameType.APPLICATION_CLOSE:
                return this.parseClose(FrameType.APPLICATION_CLOSE, buffer, offset);
            case FrameType.MAX_DATA:
                return this.parseMaxData(buffer, offset);
            case FrameType.MAX_STREAM_DATA:
                return this.parseMaxStreamData(buffer, offset);
            case FrameType.MAX_STREAM_ID:
                return this.parseMaxStreamId(buffer, offset);
            case FrameType.PING:
                return this.parsePing(buffer, offset);
            case FrameType.BLOCKED:
                return this.parseBlocked(buffer, offset);
            case FrameType.STREAM_BLOCKED:
                return this.parseStreamBlocked(buffer, offset);
            case FrameType.STREAM_ID_BLOCKED:
                return this.parseStreamIdBlocked(buffer, offset);
            case FrameType.NEW_CONNECTION_ID:
                return this.parseNewConnectionId(buffer, offset);
            case FrameType.STOP_SENDING:
                return this.parseStopSending(buffer, offset);
            case FrameType.PATH_CHALLENGE:
                return this.parsePathChallenge(buffer, offset);
            case FrameType.PATH_RESPONSE:
                return this.parsePathResponse(buffer, offset);
            case FrameType.CRYPTO:
                return this.parseCrypto(buffer, offset);
            case FrameType.ACK:
                return this.parseAck(false, buffer, offset);
            case FrameType.ACK_ECN:
                return this.parseAck(true, buffer, offset);
        }
        if (type >= FrameType.STREAM && type <= FrameType.STREAM_MAX_NR) {
            return this.parseStream(type, buffer, offset);
        }
        
        VerboseLogging.error("FrameParser:parse : UNIDENTIFIED FRAME : " + type + " // " + buffer);
        return undefined;
    }

    private parsePadding(buffer: Buffer, offset: number): FrameOffset {
        var startOffset = offset;
        while (offset < buffer.byteLength && buffer.readUInt8(offset) === 0) {
            offset++;
        }
        var paddingSize = offset - startOffset;
        return {
            frame: FrameFactory.createPaddingFrame(paddingSize),
            offset: offset
        };
    }

    private parseRstStream(buffer: Buffer, offset: number): FrameOffset {
        var streamID: VLIEOffset = VLIE.decode(buffer, offset);
        offset = streamID.offset;
        var applicationErrorCode = buffer.readUInt16BE(offset);
        offset += 2;
        var finalOffset = VLIE.decode(buffer, offset);
        return {
            frame: FrameFactory.createRstStreamFrame(streamID.value, applicationErrorCode, finalOffset.value),
            offset: finalOffset.offset
        };
    }

    private parseClose(type: FrameTypeClose, buffer: Buffer, offset: number): FrameOffset {
        var errorCode = buffer.readUInt16BE(offset);
        offset += 2;
        var phraseLength = VLIE.decode(buffer, offset);
        var phrase = buffer.toString('utf8', phraseLength.offset, phraseLength.value.toNumber());
        offset = phraseLength.offset + phraseLength.value.toNumber();
        if (type === FrameType.APPLICATION_CLOSE) {
            return {
                frame: FrameFactory.createApplicationCloseFrame(errorCode, phrase),
                offset: offset
            };
        } else {
            return {
                frame: FrameFactory.createConnectionCloseFrame(errorCode, phrase),
                offset: offset
            };
        }

    }

    private parseMaxData(buffer: Buffer, offset: number): FrameOffset {
        var maxData = VLIE.decode(buffer, offset);
        return {
            frame: FrameFactory.createMaxDataFrame(maxData.value),
            offset: maxData.offset
        };
    }

    private parseMaxStreamData(buffer: Buffer, offset: number): FrameOffset {
        var streamID = VLIE.decode(buffer, offset);
        var maxStreamData = VLIE.decode(buffer, streamID.offset);
        return {
            frame: FrameFactory.createMaxStreamDataFrame(streamID.value, maxStreamData.value),
            offset: maxStreamData.offset
        };

    }

    private parseMaxStreamId(buffer: Buffer, offset: number): FrameOffset {
        var maxStreamID = VLIE.decode(buffer, offset);
        return {
            frame: FrameFactory.createMaxStreamIdFrame(maxStreamID.value),
            offset: maxStreamID.offset
        };
    }

    private parsePing(buffer: Buffer, offset: number): FrameOffset {
        return {
            frame: FrameFactory.createPingFrame(),
            offset: offset
        };
    }

    private parseBlocked(buffer: Buffer, offset: number): FrameOffset {
        var blockedOffset = VLIE.decode(buffer, offset);
        return {
            frame: FrameFactory.createBlockedFrame(blockedOffset.value),
            offset: blockedOffset.offset
        };
    }

    private parseStreamBlocked(buffer: Buffer, offset: number): FrameOffset {
        var streamID = VLIE.decode(buffer, offset);
        var blockedOffset = VLIE.decode(buffer, streamID.offset);
        return {
            frame: FrameFactory.createStreamBlockedFrame(streamID.value, blockedOffset.value),
            offset: blockedOffset.offset
        };
    }

    private parseStreamIdBlocked(buffer: Buffer, offset: number): FrameOffset {
        var streamID = VLIE.decode(buffer, offset);
        return {
            frame: FrameFactory.createStreamIdBlockedFrame(streamID.value),
            offset: streamID.offset
        };
    }

    private parseNewConnectionId(buffer: Buffer, offset: number): FrameOffset {
        var sequence = VLIE.decode(buffer, offset);
        offset = sequence.offset;
        var connectionIDLength = buffer.readUInt8(offset++);
        var connectionIDBuffer = Buffer.alloc(connectionIDLength);
        buffer.copy(connectionIDBuffer, 0, offset, offset + connectionIDLength)
        offset += connectionIDLength;
        var statelessResetToken = Buffer.alloc(16);
        buffer.copy(statelessResetToken, 0, offset, offset + 16)
        offset += 16;
        var connectionID = new ConnectionID(connectionIDBuffer, connectionIDLength);
        return {
            frame: FrameFactory.createNewConnectionIdFrame(sequence.value, connectionID, statelessResetToken),
            offset: offset
        };
    }

    private parseStopSending(buffer: Buffer, offset: number): FrameOffset {
        var streamID = VLIE.decode(buffer, offset);
        var appErrorCode = buffer.readUInt16BE(streamID.offset);
        offset = streamID.offset + 2;
        return {
            frame: FrameFactory.createStopSendingFrame(streamID.value, appErrorCode),
            offset: offset
        };
    }

    private parseAck(containsECNinfo: boolean, buffer: Buffer, offset: number): FrameOffset {
        var largestAcknowledged: VLIEOffset = VLIE.decode(buffer, offset);
        var ackDelay: VLIEOffset = VLIE.decode(buffer, largestAcknowledged.offset);
        var ackBlockCount: VLIEOffset = VLIE.decode(buffer, ackDelay.offset);
        var firstAckBlock: VLIEOffset = VLIE.decode(buffer, ackBlockCount.offset);
        offset = firstAckBlock.offset;
        var ackBlocks: AckBlock[] = [];
        for(var i = new Bignum(1); i.lessThanOrEqual(ackBlockCount.value); i = i.add(1)) {
            var gap = VLIE.decode(buffer, offset);
            var block = VLIE.decode(buffer, gap.offset);
            offset = block.offset;
            ackBlocks.push(new AckBlock(gap.value, block.value));
        }

        let frame = FrameFactory.createAckFrame(containsECNinfo, largestAcknowledged.value, ackDelay.value, ackBlockCount.value, firstAckBlock.value, ackBlocks);

        if( containsECNinfo ){
            if( offset == buffer.length ){
                VerboseLogging.error("FrameParser:parseACK : got ACK_ECN packet but no ECN data found in buffer... ignoring");
            }
            else{
                //TODO: implement
                VerboseLogging.warn("FrameParser:parseACK : got a packet with ECN info, haven't tested this code yet!");
                let ECT0count: VLIEOffset = VLIE.decode(buffer, offset);
                let ECT1count: VLIEOffset = VLIE.decode(buffer, ECT0count.offset);
                let CEcount:   VLIEOffset = VLIE.decode(buffer, ECT1count.offset);
                offset = CEcount.offset; 

                frame.setECT0count( ECT0count.value );
                frame.setECT1count( ECT1count.value );
                frame.setCEcount(   CEcount.value   ); 
            }
        }

        return {
            frame: frame,
            offset: offset
        };
    }

    private parsePathChallenge(buffer: Buffer, offset: number): FrameOffset {
        var data: Buffer = Buffer.alloc(Constants.PATH_CHALLENGE_PAYLOAD_SIZE);
        buffer.copy(data, 0, offset, Constants.PATH_CHALLENGE_PAYLOAD_SIZE + offset);
        offset += Constants.PATH_CHALLENGE_PAYLOAD_SIZE;
        return {
            frame: FrameFactory.createPathChallengeFrame(data),
            offset: offset
        };
    }

    private parsePathResponse(buffer: Buffer, offset: number): FrameOffset {
        var data: Buffer = Buffer.alloc(Constants.PATH_RESPONSE_PAYLOAD_SIZE);
        buffer.copy(data, 0, offset, Constants.PATH_RESPONSE_PAYLOAD_SIZE + offset);
        offset += Constants.PATH_RESPONSE_PAYLOAD_SIZE;
        return {
            frame: FrameFactory.createPathResponseFrame(data),
            offset: offset
        };
    }

    private parseCrypto(buffer: Buffer, offset: number): FrameOffset {
        // https://tools.ietf.org/html/draft-ietf-quic-transport#section-7.21
        // VLIE offset, VLIE length, Data
        let cryptooffset = VLIE.decode(buffer, offset);
        offset = cryptooffset.offset;

        let lengthV = VLIE.decode(buffer, offset);
        offset = lengthV.offset;
        let length = lengthV.value;

        let data = Buffer.alloc( length.toNumber() );
        buffer.copy(data, 0, offset, length.toNumber() + offset);
        offset += length.toNumber();

        return {
            frame: FrameFactory.createCryptoFrame(data, cryptooffset.value),
            offset: offset
        };
    }

    private parseStream(type: number, buffer: Buffer, offset: number): FrameOffset {
        var fin = false, len = false, off = false;
        if (type & 0x01) {
            fin = true;
        }
        if (type & 0x02) {
            len = true;
        }
        if (type & 0x04) {
            off = true;
        }
        var streamID = VLIE.decode(buffer, offset);
        offset = streamID.offset
        var dataOffset = new Bignum(0);
        if (off) {
            var vlieOffset = VLIE.decode(buffer, offset);
            dataOffset = vlieOffset.value;
            offset = vlieOffset.offset;
        }
        var dataLength = new Bignum(buffer.byteLength - offset);
        if (len) {
            var vlieOffset = VLIE.decode(buffer, offset);
            dataLength = vlieOffset.value;
            offset = vlieOffset.offset;
        }
        var data = Buffer.alloc(dataLength.toNumber());
        buffer.copy(data, 0, offset, dataLength.toNumber() + offset);
        offset += dataLength.toNumber();

        var streamFrame = FrameFactory.createStreamFrame(streamID.value, data, fin, true, dataOffset);
        streamFrame.setLength(dataLength);
        return {
            frame: streamFrame,
            offset: offset
        };
    }
}


export interface FrameOffset {
    frame: BaseFrame,
    offset: number
}

type FrameTypeClose = FrameType.CONNECTION_CLOSE | FrameType.APPLICATION_CLOSE;