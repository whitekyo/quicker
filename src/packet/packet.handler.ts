import {BaseEncryptedPacket} from './base.encrypted.packet';
import {TransportParameterType} from '../crypto/transport.parameters';
import {ConnectionID} from './../types/header.properties';
import {FrameType, BaseFrame} from '../frame/base.frame';
import { Connection } from '../types/connection';
import { BasePacket, PacketType } from './base.packet';
import { HandshakePacket } from './packet/handshake';
import { EndpointType } from '../types/endpoint.type';
import { FrameHandler } from './../frame/frame.handler';
import { StreamFrame } from './../frame/general/stream';
import { PacketFactory } from './packet.factory';
import { Stream } from '../types/stream';
import { Bignum } from '../types/bignum';
import { ClientInitialPacket } from './packet/client.initial';
import { HandshakeState } from './../crypto/qtls';
import { ShortHeaderPacket } from './packet/short.header.packet';


export class PacketHandler {

    private frameHandler: FrameHandler;

    public constructor() {
        this.frameHandler = new FrameHandler();
    }

    public handle(connection: Connection, packet: BasePacket) {
        switch (packet.getPacketType()) {
            case PacketType.Initial:
                var clientInitialPacket: ClientInitialPacket = <ClientInitialPacket> packet;
                this.handleInitialPacket(connection, clientInitialPacket);
                break;
            case PacketType.Handshake:
                var handshakePacket: HandshakePacket = <HandshakePacket>packet;
                this.handleHandshakePacket(connection, handshakePacket);
                break;
            case PacketType.Protected1RTT:
                var shortHeaderPacket: ShortHeaderPacket = <ShortHeaderPacket>packet;
                this.handleProtected1RTTPacket(connection, shortHeaderPacket);
        }
    }

    public handleInitialPacket(connection: Connection, clientInitialPacket: ClientInitialPacket): void {
        var connectionID = clientInitialPacket.getHeader().getConnectionID();
        if (connectionID === undefined) {
            throw Error("No ConnectionID defined");
        }
        connection.setConnectionID(ConnectionID.randomConnectionID());
        this.handleFrames(connection, clientInitialPacket);
    }

    public handleHandshakePacket(connection: Connection, handshakePacket: HandshakePacket): void {
        var connectionID = handshakePacket.getHeader().getConnectionID();
        if (connectionID === undefined) {
            throw Error("No ConnectionID defined");
        }
        connection.setConnectionID(connectionID);
        this.handleFrames(connection, handshakePacket);
    }

    public handleProtected1RTTPacket(connection: Connection, shortHeaderPacket: ShortHeaderPacket) {
        this.handleFrames(connection, shortHeaderPacket);
    }

    private handleFrames(connection: Connection, packet: BaseEncryptedPacket) {
        packet.getFrames().forEach((baseFrame: BaseFrame) => {
            this.frameHandler.handle(connection, baseFrame);
        });
    }
}