from flask import Flask, request, send_file, jsonify, session
from io import BytesIO
from flask_cors import CORS
import sys
import json
from datetime import date
import time
import threading

import mimetypes
import os

import re

from pymongo import MongoClient

app = Flask(__name__)
app.secret_key = 'my_secret_key'
CORS(app)  # Enable CORS if frontend is served elsewhere



#--------------------------- pre-load data ---------------


HARD_TYPE_ITEMS = ["ADAM", "DIN-Rail", "Rack", "Rack modular", "RJ-45", "Fiber", "PoE", "AC", "DC", "Normal Temp", "Wide Temp"]
SOFT_TYPE_ITEMS = ["Flow Control (IEEE 802.3x)", "Jumbo Frame", "Link Aggregation LACP (IEEE 802.3ad)", "VLAN(IEEE 802.1Q)", "GARP-GVRP", "GARP-GMRP", "Spanning Tree (IEEE 802.1D STP)", "Spanning Tree(IEEE 802.1w RSTP)", "Spanning Tree(IEEE 802.1s MSTP)", "Port Mirroring", "RSPAN-Remote Switched Port Analysis", "LLDP(IEEE 802.1ab)", "IGMP Snooping v1/v2/v3", "MLD Snooping", "NAT", "RIP2", "OSPFv2", "OSPFv3", "VRRP", "PIM-DM", "PIM-SM", "PIM-SSM", "X-Ring Pro", "ERPS(G.8032)", "QoS IEEE 802.1p Based CoS", "QoS IP TOS / Precedence", "QoS DSCP based CoS", "GOOSE", "PTP", "IEC 62443-4-1 ML2", "IEC 62443-4-2 SL2", "Port Storm Control", "Loop Detection / Prevention", "DoS Attack Prevention", "Port Security", "IEEE 802.1X", "Remote Authentication - RADIUS/TACACS+", "IP Security - IP Source Guard/DHCP Snooping/ARP Spoofing Prevention", "Access Control List (ACL)", "Green Ethernet (IEEE 802.3az EEE)", "OAM - IEEE 802.1ag CFM", "OAM - IEEE 802.3ah", "SNMP-SNMPv1/v2c/v3/Trap", "DHCP - Client", "DHCP - Server", "DHCP Relay", "DHCP Option 82", "DNS - Client", "DNS - Server", "NTP Client", "NTP Server", "SNTP Client", "SMTP", "RMONv1", "Industrial Protocol - Modbus TCP", "IXM", "IPv6", "IEEE 1588v2", "IEC 62439", "IEC 61850", "TSN", "ITxPT", "IEC 61375-2-5 TTDP", "IEC 61375-2-3 TRDP", "Standard MIB", "Private MIB"]

SOFT_TYPE_KEY = [["IEEE 802.3x (Full-duplex)", "Back-Pressure (Half-duplex)"], ["Max. Frame Size"], ["Static Trunk", "IEEE 802.3ad LACP", "MLAG", "Max. LAGs", "Max. Ports per LAG", "Load Balance"], ["Max. Static VLANs", "VLAN ID (Range)", "IEEE 802.1Q Tag-based VLAN", "Port-based VLAN", "IEEE 802.1v Protocol-based VLAN", "MAC-based VLAN", "IP Subnet-based VLAN", "Private VLAN", "Voice VLAN", "Surveillance VLAN", "IEEE 802.1ad Q-in-Q"], ["GVRP"], ["GMRP"], ["IEEE 802.1D STP"], ["IEEE 802.1w RSTP"], ["IEEE 802.1s MSTP"], ["1 to 1 SPAN", "N to 1 SPAN", "Max. SPAN Sessions"], ["RSPAN", "ERSPAN"], ["Port Description", "System Name", "System Description", "System Capabilities", "Management Address", "IEEE 802.3 MAC/PHY", "IEEE 802.3 Link Aggregation", "IEEE 802.3 Max. Frame Size", "IEEE 802.1 PVID", "LLDP-MED"], ["IGMPv1/v2", "IGMPv3"], ["MLDv1", "MLDv2"], ["SNAT", "DNAT", "NAT-Port-Forwarding"], ["RIP2"], ["OSPFv2"], ["OSPFv3"], ["VRRP"], ["PIM-DM"], ["PIM-SM"], ["PIM-SSM"], ["Multiple Ring", "Ring Coupling", "X-Chain", "X-Pair", "X-Ring-Dual Home"], ["G.8032 ERPS", "ERPS-Inter-Connected Node", "ERPS-CFM Instance"], ["QoS-IEEE 802.1p"], ["QoS-IP TOS"], ["QoS-DSCP"], ["GOOSE"], ["PTP"], ["IEC 62443-4-1 ML2"], ["IEC 62443-4-2 SL2"], ["Broadcast", "Unknown Multicast", "Unknown Unicast"], ["Loop Detection", "Loop Prevention"], ["UDP Floods", "ICMP Floods", "SYN Floods", "XMAS", "LAND", "Smurf", "Ping-of-Deadth"], ["Static MAC", "MAB", "Per-port Max. Learning Limit", "MAC Violation Notice"], ["Port-based Authentication", "MAC-based Authentication", "Encrypted Method"], ["RADIUS", "TACACS+"], ["IP Source Guard", "DHCP Snooping", "ARP Spoofing Prevention"], ["L2 ACL", "L3 ACL", "L4 ACL", "Access Control List-Action", "Access Control List-Flow-based Mirroring", "Access Control List-Flow-based QoS", "Flow-based Rate Limit"], ["IEEE 802.3az EEE", "Energy Detection", "Short Reach"], ["CFM-Continuity Check", "CFM-Loopback"], ["OAM-Link Monitor", "OAM-Remote Loopback", "OAM-Dying Gasp", "OAM-UDLD"], ["SNMPv1/v2c", "SNMPv3", "Trap"], ["DHCP Client"], ["DHCP Server"], ["DHCP Relay"], ["DHCP-Option 82"], ["DNS Client"], ["DNS Server"], ["NTP Client"], ["NTP Server"], ["SNTP Client"], ["E-mail Alert"], ["RMONv1"], ["Modbus TCP", "PROFINET", "EtherNet/IP"], ["IP Assignment", "Configuration Sync", "Firmware Sync"], ["DHCPv6", "ICMPv6", "SNMP over IPv6", "HTTP over IPv6", "TELNET over IPv6", "SSH over IPv6", "TFTP over IPv6"], ["IEEE 1588v2-Precision", "IEEE 1588v2-E2E Boundary Clock", "IEEE 1588v2-P2P Boundary Clock", "IEEE 1588v2-E2E Transparent Clock", "IEEE 1588v2-P2P Transparent Clock", "IEEE 1588v2-1-Step"], ["IEC 62439-2 MRP", "IEC 62439-3 HSR / PRP"], ["GOOSE Subscriber", "MMS Server"], ["IEEE 802.1AS gPTP", "IEEE 802.1Qci PSFP", "IEEE 802.1Qav CBS for AVB", "IEEE 802.1Qbv TAS", "IEEE 802.1Qch CQF", "TSN-Cut-Through", "IEEE 802.1Qbu (Bridge)", "IEEE 802.3br (MAC)", "IEEE 802.1CB FRER", "IEEE 802.1Qcc SRP", "IEEE 802.1Qcc YANG"], ["mDNS"], ["Address Plan"], ["TCNOpen Version", "ComId 1 (Pd)", "ComId 2 (Md)", "ComId 3 (Md)", "ComId 100 (Pd)", "ComId 120, 121 (Pd)", "ComId 130, 131 (Md)", "ComId 132, 133 (Md)", "ComId 108, 109 (Md)"], ["MIB-II", "IF-MIB", "dot3OamMIB", "Ethernet-Like MIB", "RMON MIB", "IEEE8021-BRIDGE-MIB", "IEEE8021-Q-BRIDGE-MIB", "Link-Aggregation-MIB", "MAU-MIB", "PoE-MIB", "ENTITY-MIB", "IEEE8021-CFM-MIB", "IEEE8021-CFM-V2-MIB"], ["1.3.6.1.4.1"]]
PROD_TYPE_ITEMS = ["ADAM", "DIN-Rail", "Rack", "Rack modular", "RJ-45", "Fiber", "PoE", "AC", "DC", "Normal Temp", "Wide Temp"]
KEY_VALUE_ITEMS = []



def get_soft_type_from_mongodb():
    global KEY_VALUE_ITEMS
    global PROD_TYPE_ITEMS

    client = MongoClient("mongodb+srv://samuelsky8_db_user:xGkAp8ecUdopRTuq@cluster0.amt9qik.mongodb.net/?appName=Cluster0")
    db = client["Switch_soft_type"]
    collection = db["switch_soft_transformed"]

    KEY_VALUE_ITEMS = []
    for ele in SOFT_TYPE_ITEMS:
        PROD_TYPE_ITEMS.append(ele)


get_soft_type_from_mongodb()


def filter_prod(soft_list, hard_list, portnum, managed_tag):
    results = []
    hard_results = []
    soft_results_tmp = []
    soft_results_changed = []
    soft_results = []
    cont_tag = 0
    results_info = []

    client = MongoClient("mongodb+srv://samuelsky8_db_user:xGkAp8ecUdopRTuq@cluster0.amt9qik.mongodb.net/?appName=Cluster0")
    db_hard = client["Switch_hard_type"]
    db_soft = client["Switch_soft_type"]

    collection = db_hard["switch_hard_transformed"]
    for doc in collection.find():
        if doc["Function"] != managed_tag:
            continue
        elif int(doc["Port_Numbers"]) < int(portnum):
            continue
        else:
            cont_tag = 0
            for ele in hard_list:
                if ele == "ADAM":
                    if doc["Type "] != "ADAM":
                        cont_tag = 1
                        break
                elif ele == "DIN-Rail":
                    if doc["Type "] != "DIN-Rail":
                        cont_tag = 1
                        break
                elif ele == "Rack":
                    if doc["Type "] != "Rack":
                        cont_tag = 1
                        break
                elif ele == "Rack modular":
                    if doc["Type "] != "Rack modular":
                        cont_tag = 1
                        break
                elif ele == "RJ-45":
                    if doc["RJ-45-10/100 Mbps "] == doc["RJ-45-Gigabit "] == doc["RJ-45-10/100Mbps combo"] == doc["RJ-45-10GbE"] == "None":
                        cont_tag = 1
                        break
                elif ele == "Fiber":
                    if doc["Fiber-100 Mbps "] == doc["Fiber-Gigabit"] == doc["Fiber-GE Combo ports"] == doc["Fiber-10G"] == doc["Fiber-Type"] == doc["Fiber-Connector"] == "None":
                        cont_tag = 1
                        break
                elif ele == "PoE":
                    if doc["PoE RJ-45 (10/100 Mbps)"] == doc["PoE RJ-45 (Gigabit)"] == "None":
                        cont_tag = 1
                        break
                elif ele == "AC":
                    if "AC" not in doc["Input"]:
                        cont_tag = 1
                        break
                elif ele == "DC":
                    if "DC" not in doc["Input"]:
                        cont_tag = 1
                        break
                elif ele == "Normal Temp":
                    if "N" not in doc["Wide-temp_Normal-temp"]:
                        cont_tag = 1
                        break
                elif ele == "Wide Temp":
                    if "W" not in doc["Wide-temp_Normal-temp"]:
                        cont_tag = 1
                        break
            if cont_tag == 1:
                continue

            hard_results.append(doc["Part Number"])

    collection = db_soft["switch_soft_transformed"]
    for doc in collection.find():
        cont_tag = 1
        if len(soft_list) < 1:
            soft_results_tmp.append(doc["Model Name"])
        else:
            for ele in soft_list:
                cont_tag = 1
                for a, b in zip(SOFT_TYPE_ITEMS, SOFT_TYPE_KEY):
                    if ele == a:
                        for c in b:
                            if doc[c] != "None":
                                cont_tag = 0
                                break
                        if cont_tag == 0:
                            break
                if cont_tag == 1:
                    break
            if cont_tag == 1:
                continue
            soft_results_tmp.append(doc["Model Name"])
    for ele in soft_results_tmp:
        if ele not in soft_results:
            soft_results_changed.append(ele)

    for name in soft_results_changed:
        if name == "EKI-5700/7400/7700/9200/9500":
            soft_results.append("EKI-57")
            soft_results.append("EKI-74")
            soft_results.append("EKI-77")
            soft_results.append("EKI-92")
            soft_results.append("EKI-95")
        elif name == "EKI-9600":
            soft_results.append("EKI-96")
        elif name == "EKI-7428":
            soft_results.append("EKI-7428")
        elif name == "EKI-7454":
            soft_results.append("EKI-7454")
        elif name == "EKI-7500":
            soft_results.append("EKI-75")
        elif name == "EKI-8500":
            soft_results.append("EKI-85")

    if soft_list == []:
        results = hard_results
    else:
        results = [
            b for b in hard_results
            if any(a.lower() in b.lower() for a in soft_results)
        ]
    collection = db_hard["switch_hard_transformed"]
    for doc in collection.find():
        for a in results:
            if doc["Part Number"] == a:
                ele_dict = {
                    "prod_function": doc["Function"],
                    "prod_type": doc["Type "],
                    "prod_name": doc["Product"],
                    "prod_model": doc["Part Number"],
                    "prod_lifecycle": doc["PLM Lifecycle Phase"],
                    "prod_desc": doc["Description"],
                    "prod_portnum": doc["Port_Numbers"],
                    "prod_rj_100": doc["RJ-45-10/100 Mbps "],
                    "prod_rj_giga": doc["RJ-45-Gigabit "],
                    "prod_rj_100_combo": doc["RJ-45-10/100Mbps combo"],
                    "prod_rj_10gbe": doc["RJ-45-10GbE"],
                    "prod_fiber_100": doc["Fiber-100 Mbps "],
                    "prod_fiber_giga": doc["Fiber-Gigabit"],
                    "prod_fiber_ge_combo": doc["Fiber-GE Combo ports"],
                    "prod_fiber_10g": doc["Fiber-10G"],
                    "prod_fiber_type": doc["Fiber-Type"],
                    "prod_fiber_conn": doc["Fiber-Connector"],
                    "prod_poe_rj_100": doc["PoE RJ-45 (10/100 Mbps)"],
                    "prod_poe_rj_giga": doc["PoE RJ-45 (Gigabit)"],
                    "prod_poe_standard": doc["PoE\nStandard"],
                    "prod_power_bdg": doc["Power Budget"],
                    "prod_input": doc["Input"],
                    "prod_w_n": doc["Wide-temp_Normal-temp"]
                        }
                results_info.append(ele_dict)

    return results_info


@app.route("/api/searchProdType")
def ProdTypesearch():
    query = request.args.get("q", "").lower()

    results = []
    #for item in PROD_TYPE_ITEMS:
    for item in PROD_TYPE_ITEMS:
        if query in item.lower():
            results.append(item)
    results.sort()

    return jsonify(results)  # limit to 10 results

@app.route("/api/submitProdType", methods=["POST"])
def ProdTypesubmit():
    data = request.json
    selected_items = data.get("items", [])
    mgmt_type = data.get("type")
    port_num = data.get("portnum")

    result_prods = ""
    prod_list = []
    soft_type_list = []
    hard_type_list = []
    filtered_list = []
    for ele in selected_items:
        if ele not in HARD_TYPE_ITEMS:
            soft_type_list.append(ele)
        else:
            hard_type_list.append(ele)

    if mgmt_type == "managed":
        filtered_list = filter_prod(soft_type_list, hard_type_list, port_num, "Managed")
    else:
        filtered_list = filter_prod(soft_type_list, hard_type_list, port_num, "Unmanaged")


    list_len1 = len(SOFT_TYPE_ITEMS)
    list_len2 = len(SOFT_TYPE_KEY)

    return jsonify({'status': 'success', 'products': filtered_list})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
