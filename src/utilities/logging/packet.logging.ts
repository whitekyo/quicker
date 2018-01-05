import { Connection } from '../../types/connection';
import { BasePacket, PacketType } from '../../packet/base.packet';
import { ConsoleColor } from './colors';
import { BaseEncryptedPacket } from '../../packet/base.encrypted.packet';
import { BaseFrame, FrameType } from '../../frame/base.frame';
import { PaddingFrame } from '../../frame/general/padding';
import { RstStreamFrame } from '../../frame/general/rst.stream';
import { ConnectionCloseFrame, ApplicationCloseFrame } from '../../frame/general/close';
import { MaxDataFrame } from '../../frame/general/max.data';
import { MaxStreamFrame } from '../../frame/general/max.stream';
import { MaxStreamIdFrame } from '../../frame/general/max.stream.id';
import { PingFrame, PongFrame } from '../../frame/general/ping';
import { BlockedFrame } from '../../frame/general/blocked';
import { StreamBlockedFrame } from '../../frame/general/stream.blocked';
import { StreamIdBlockedFrame } from '../../frame/general/stream.id.blocked';
import { NewConnectionIdFrame } from '../../frame/general/new.connection.id';
import { StopSendingFrame } from '../../frame/general/stop.sending';
import { AckFrame } from '../../frame/general/ack';
import { StreamFrame } from '../../frame/general/stream';
import { configure, getLogger, Logger } from 'log4js';



export class PacketLogging {

    private static logger: PacketLogging;
    private startOutput: Logger;
    private continuedOutput: Logger;

    public static getInstance(): PacketLogging {
        if (this.logger === undefined) {
            this.logger = new PacketLogging();
        }
        return this.logger;
    }


    private constructor() {
        configure({
            appenders: {
                startOut: {
                    type: 'stdout', layout: {
                        type: 'pattern',
                        pattern: '%[%d%] %n%m'
                    }
                },
                continuedOut: {
                    type: 'stdout', layout: {
                        type: 'pattern',
                        pattern: '%m'
                    }
                }
            },
            categories: { 
                start: { 
                    appenders: ['startOut'], 
                    level: 'debug' 
                },
                default: {
                    appenders: ['continuedOut'], 
                    level: 'debug' 
                }
            }
        });
        this.startOutput = getLogger("start");
        this.startOutput.level = 'debug';
        this.continuedOutput = getLogger();
        this.continuedOutput.level = 'debug';
    }

    public logIncomingPacket(connection: Connection, basePacket: BasePacket) {
        this.logPackets(connection, basePacket, "RX", ConsoleColor.FgBlue);
    }

    public logOutgoingPacket(connection: Connection, basePacket: BasePacket) {
        this.logPackets(connection, basePacket, "TX", ConsoleColor.FgRed);
    }

    private logPackets(connection: Connection, basePacket: BasePacket, direction: string, color: ConsoleColor): void {
        var connectionID = basePacket.getHeader().getConnectionID();
        var connectionIDString = connectionID === undefined ? "omitted" : connectionID.toString();
        var pn = basePacket.getHeader().getPacketNumber().getPacketNumber().toDecimalString();
        this.startOutput.debug(this.getSpaces(2) + "%s " + color + "%s(0x%s)" + ConsoleColor.Reset + " CID: 0x%s, " + color + "PKN: %s" + ConsoleColor.Reset + " ",
            direction, PacketType[basePacket.getPacketType()], basePacket.getHeader().getPacketType().toString(16), connectionIDString, pn);

        switch (basePacket.getPacketType()) {
            case PacketType.Retry:
                break;
            case PacketType.VersionNegotiation:
                break;
            case PacketType.Initial:
            case PacketType.Handshake:
            case PacketType.Protected1RTT:
                var baseEncryptedPacket: BaseEncryptedPacket = <BaseEncryptedPacket>basePacket;
                this.logFrames(baseEncryptedPacket, color);
        }
    }

    private logFrames(baseEncryptedPacket: BaseEncryptedPacket, color: ConsoleColor): void {
        baseEncryptedPacket.getFrames().forEach((baseFrame) => {
            this.logFrame(baseFrame, color);
        });
    }

    private logFrame(baseFrame: BaseFrame, color: ConsoleColor): void {
        if (baseFrame.getType() < FrameType.STREAM) {
            this.continuedOutput.debug(this.getSpaces(4) + color + "%s (0x%s)" + ConsoleColor.Reset, FrameType[baseFrame.getType()], baseFrame.getType().toString(16));
        }
        switch (baseFrame.getType()) {
            case FrameType.PADDING:
                var paddingFrame: PaddingFrame = <PaddingFrame>baseFrame;
                this.logPaddingFrame(paddingFrame, color);
                break;
            case FrameType.RST_STREAM:
                var rstStreamFrame: RstStreamFrame = <RstStreamFrame>baseFrame;
                this.logRstStreamFrame(rstStreamFrame, color);
                break;
            case FrameType.CONNECTION_CLOSE:
                var connectionCloseFrame: ConnectionCloseFrame = <ConnectionCloseFrame>baseFrame;
                this.logConnectionCloseFrame(connectionCloseFrame, color);
                break;
            case FrameType.APPLICATION_CLOSE:
                var applicationCloseFrame: ApplicationCloseFrame = <ApplicationCloseFrame>baseFrame;
                this.logApplicationCloseFrame(applicationCloseFrame, color);
                break;
            case FrameType.MAX_DATA:
                var maxDataFrame: MaxDataFrame = <MaxDataFrame>baseFrame;
                this.logMaxDataFrame(maxDataFrame, color);
                break;
            case FrameType.MAX_STREAM_DATA:
                var maxStreamFrame: MaxStreamFrame = <MaxStreamFrame>baseFrame;
                this.logMaxStreamFrame(maxStreamFrame, color);
                break;
            case FrameType.MAX_STREAM_ID:
                var maxStreamIdFrame: MaxStreamIdFrame = <MaxStreamIdFrame>baseFrame;
                this.logMaxStreamIdFrame(maxStreamIdFrame, color);
                break;
            case FrameType.PING:
                var pingFrame: PingFrame = <PingFrame>baseFrame;
                this.logPingFrame(pingFrame, color);
                break;
            case FrameType.BLOCKED:
                var blockedFrame: BlockedFrame = <BlockedFrame>baseFrame;
                this.logBlockedFrame(blockedFrame, color);
                break;
            case FrameType.STREAM_BLOCKED:
                var streamBlockedFrame: StreamBlockedFrame = <StreamBlockedFrame>baseFrame;
                this.logStreamBlockedFrame(streamBlockedFrame, color);
                break;
            case FrameType.STREAM_ID_BLOCKED:
                var streamIdBlockedFrame: StreamIdBlockedFrame = <StreamIdBlockedFrame>baseFrame;
                this.logStreamIdBlockedFrame(streamIdBlockedFrame, color);
                break;
            case FrameType.NEW_CONNECTION_ID:
                var newConnectionIdFrame: NewConnectionIdFrame = <NewConnectionIdFrame>baseFrame;
                this.logNewConnectionIdFrame(newConnectionIdFrame, color);
                break;
            case FrameType.STOP_SENDING:
                var stopSendingFrame: StopSendingFrame = <StopSendingFrame>baseFrame;
                this.logStopSendingFrame(stopSendingFrame, color);
                break;
            case FrameType.PONG:
                var pongFrame: PongFrame = <PongFrame>baseFrame;
                this.logPongFrame(pongFrame, color);
                break;
            case FrameType.ACK:
                var ackFrame: AckFrame = <AckFrame>baseFrame;
                this.logAckFrame(ackFrame, color);
                break;
        }
        if (baseFrame.getType() >= FrameType.STREAM) {
            var streamFrame: StreamFrame = <StreamFrame>baseFrame;
            this.logStreamFrame(streamFrame, color);
        }
    }

    private logPaddingFrame(paddingFrame: PaddingFrame, color: ConsoleColor): void {
    }

    private logRstStreamFrame(rstStreamFrame: RstStreamFrame, color: ConsoleColor): void {

    }

    private logConnectionCloseFrame(connectionCloseFrame: ConnectionCloseFrame, color: ConsoleColor): void {

    }

    private logApplicationCloseFrame(applicationCloseFrame: ApplicationCloseFrame, color: ConsoleColor): void {

    }

    private logMaxDataFrame(maxDataFrame: MaxDataFrame, color: ConsoleColor): void {

    }

    private logMaxStreamFrame(maxStreamFrame: MaxStreamFrame, color: ConsoleColor): void {

    }

    private logMaxStreamIdFrame(maxStreamIdFrame: MaxStreamIdFrame, color: ConsoleColor): void {

    }

    private logPingFrame(pingFrame: PingFrame, color: ConsoleColor): void {

    }

    private logBlockedFrame(blockedFrame: BlockedFrame, color: ConsoleColor): void {

    }

    private logStreamBlockedFrame(streamBlockedFrame: StreamBlockedFrame, color: ConsoleColor): void {

    }

    private logStreamIdBlockedFrame(streamIdBlockedFrame: StreamIdBlockedFrame, color: ConsoleColor): void {

    }

    private logNewConnectionIdFrame(newConnectionIdFrame: NewConnectionIdFrame, color: ConsoleColor): void {

    }

    private logStopSendingFrame(stopSendingFrame: StopSendingFrame, color: ConsoleColor): void {

    }

    private logPongFrame(pongFrame: PongFrame, color: ConsoleColor): void {

    }

    private logAckFrame(ackFrame: AckFrame, color: ConsoleColor): void {

    }

    private logStreamFrame(streamFrame: StreamFrame, color: ConsoleColor): void {
        this.continuedOutput.debug(this.getSpaces(4) + color + "STREAM (0x%s) " + ConsoleColor.Reset + " FIN=%d LEN=%d OFF=%d", streamFrame.getType().toString(16), streamFrame.getFin(), streamFrame.getLen(), streamFrame.getOff());
        this.continuedOutput.debug(this.getSpaces(4) + "StreamID (0x%s) length=%s offset=%s", streamFrame.getStreamID().toDecimalString(), streamFrame.getLength().toDecimalString(), streamFrame.getOffset().toDecimalString());

    }

    private getSpaces(amount: number): string {
        return Array(amount + 1).join(" ");
    }
}