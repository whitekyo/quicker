import {ConnectionErrorCodes} from '../errors/connection.codes';
import {QuicError} from '../errors/connection.error';
import {FrameParser} from './frame.parser';
import {AEAD} from '../../crypto/aead';
import {Connection} from '../../quicker/connection';
import {HeaderOffset} from './header.parser';
import {EndpointType} from '../../types/endpoint.type';
import {HeaderType, BaseHeader} from '../../packet/header/base.header';
import {LongHeader, LongHeaderType} from '../../packet/header/long.header';
import {Version} from "../../packet/header/header.properties";
import {Constants} from '../constants';
import {ClientInitialPacket} from '../../packet/packet/client.initial';
import {VersionNegotiationPacket} from '../../packet/packet/version.negotiation';
import {HandshakePacket} from '../../packet/packet/handshake';
import {BasePacket} from '../../packet/base.packet';
import { ShortHeaderPacket } from '../../packet/packet/short.header.packet';
import { Protected0RTTPacket } from '../../packet/packet/protected.0rtt';


export class PacketParser {
    private frameParser: FrameParser;

    public constructor() {
        this.frameParser = new FrameParser();
    }

    public parse(connection: Connection, headerOffset: HeaderOffset, msg: Buffer, endpoint: EndpointType): PacketOffset {
        var header = headerOffset.header;
        if (header.getHeaderType() === HeaderType.LongHeader) {
            return this.parseLongHeaderPacket(connection, header, msg, endpoint)
        }
        return this.parseShortHeaderPacket(connection, headerOffset, msg, endpoint);
    }

    private parseLongHeaderPacket(connection: Connection, header: BaseHeader, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var longheader = <LongHeader>header;
        var offset = Constants.LONG_HEADER_SIZE;
        // Version negotiation packet
        if (longheader.getVersion().toString() === "00000000") {
            offset = Constants.LONG_HEADER_VN_SIZE;
            return this.parseVersionNegotiationPacket(header, buffer, offset);
        }
        switch (header.getPacketType()) {
            case LongHeaderType.Initial:
                return this.parseClientInitialPacket(connection, header, buffer, offset, endpoint);
                // Initial
            case LongHeaderType.Protected0RTT:
                return this.parseProtected0RTTPacket(connection, header, buffer, offset, endpoint);
                // 0-RTT Protected
            case LongHeaderType.Retry:
                // Server Stateless Retry
                throw new Error("Method not implemented.");
            case LongHeaderType.Handshake:
                return this.parseHandshakePacket(connection, header, buffer, offset, endpoint);
            default:
                // Unknown packet type
                throw new QuicError(ConnectionErrorCodes.PROTOCOL_VIOLATION);
        }
    }

    private parseShortHeaderPacket(connection: Connection, headerOffset: HeaderOffset, buffer: Buffer, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - headerOffset.offset);
        buffer.copy(dataBuffer, 0, headerOffset.offset);
        dataBuffer = connection.getAEAD().protected1RTTDecrypt(connection, headerOffset.header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new ShortHeaderPacket(headerOffset.header, frames),
            offset: headerOffset.offset
        };
    }

    private parseVersionNegotiationPacket(header: BaseHeader, buffer: Buffer, offset: number): PacketOffset {
        var versions: Version[] = [];
        while (buffer.length > offset) {
            var version: Version = new Version(buffer.slice(offset, offset + 4));
            versions.push(version);
            offset += 4;
        }
        return {
            packet: new VersionNegotiationPacket(header, versions),
            offset: offset
        };
    }

    private parseClientInitialPacket(connection: Connection, header: BaseHeader, buffer: Buffer, offset: number, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - offset);
        buffer.copy(dataBuffer, 0, offset);
        dataBuffer = connection.getAEAD().clearTextDecrypt(connection, header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new ClientInitialPacket(header, frames),
            offset: offset
        };
    }

    private parseProtected0RTTPacket(connection: Connection, header: BaseHeader, buffer: Buffer, offset: number, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - offset);
        buffer.copy(dataBuffer, 0, offset);
        dataBuffer = connection.getAEAD().protected0RTTDecrypt(connection, header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new Protected0RTTPacket(header, frames),
            offset: offset
        };
    }

    private parseHandshakePacket(connection: Connection, header: BaseHeader, buffer: Buffer, offset: number, endpoint: EndpointType): PacketOffset {
        var dataBuffer = Buffer.alloc(buffer.byteLength - offset);
        buffer.copy(dataBuffer, 0, offset);
        dataBuffer = connection.getAEAD().clearTextDecrypt(connection, header, dataBuffer, endpoint);
        var frames = this.frameParser.parse(dataBuffer, 0);
        return {
            packet: new HandshakePacket(header, frames),
            offset: offset
        };
    }
}
/**
 * Interface so that the offset of the buffer is also returned
 */
export interface PacketOffset {
    packet: BasePacket,
    offset: number
}