import os
import sys
import yaml
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A3, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pdfrw import PdfReader
from pdfrw.buildxobj import pagexobj
from pdfrw.toreportlab import makerl

base_dir = os.path.dirname(__file__)
repo_root = Path(base_dir).resolve().parents[0]
TEMPLATE_PDF = os.path.join(base_dir, "template/tmpl_marriage_registration.pdf")
RESULT_PDF = "result.pdf"
# Local runs default to the gitignored private config; GitHub Actions passes
# config-public.yaml explicitly as the first argument.
DEFAULT_CONFIG_PATH = os.path.join(repo_root, "config-private.yaml")
pdfmetrics.registerFont(TTFont("ipaexm", os.path.join(base_dir, "fonts/ipaexm.ttf")))
pdfmetrics.registerFont(TTFont("ipaexg", os.path.join(base_dir, "fonts/ipaexg.ttf")))


def setup():
    cc = canvas.Canvas(RESULT_PDF, pagesize=landscape(A3))
    page = PdfReader(TEMPLATE_PDF, decompress=False).pages
    pp = pagexobj(page[0])
    cc.doForm(makerl(cc, pp))
    return cc


def resolve_config_path():
    if len(sys.argv) > 1:
        return sys.argv[1]
    if not os.path.exists(DEFAULT_CONFIG_PATH):
        sys.exit(
            "config-private.yaml not found.\n"
            "Create your local config by copying the public sample and filling "
            "in your details:\n"
            "    cp config-public.yaml config-private.yaml"
        )
    return DEFAULT_CONFIG_PATH


def load_config(config_path):
    with open(config_path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return cfg


def husband_name_info(cfg, cc):
    cc.setFont("ipaexm", 24)
    x, y = cfg["last_name_pos"]
    cc.drawString(x, y, cfg["last_name"])
    cc.setFont("ipaexm", 12)
    x, y = cfg["last_name_kana_pos"]
    cc.drawString(x, y, cfg["last_name_kana"])
    cc.setFont("ipaexm", 24)
    x, y = cfg["first_name_pos"]
    cc.drawString(x, y, cfg["first_name"])
    cc.setFont("ipaexm", 12)
    x, y = cfg["first_name_kana_pos"]
    cc.drawString(x, y, cfg["first_name_kana"])
    cc.setFont("ipaexm", 12)
    cc.drawString(221, 569, str(cfg["birth_year"]))
    cc.drawString(300, 569, str(cfg["birth_month"]))
    cc.drawString(345, 569, str(cfg["birth_day"]))
    return cc


def husband_address_info(cfg, cc):
    cc.setFont("ipaexm", 12)
    x, y = cfg["address_first_pos"]
    cc.drawString(x, y, str(cfg["address_first"]))
    cc.drawString(x - 12, y - 21, str(cfg["address_second"]))
    if cfg["is_banchi_address"]:
        cc.ellipse(300, 539, 270, 528)
    else:
        cc.circle(279.5, 523, 6)
    cc.drawString(x + 80, y - 21, str(cfg["address_go"]))
    cc.drawString(x + 10, y - 44, str(cfg["household_person"]))
    cc.setFont("ipaexm", 5)
    y -= 13
    for text in cfg["address_apartment"].split("\n"):
        cc.drawString(x+130, y, text)
        y -= 5
    return cc


def husband_legally_domiciled_info(cfg, cc):
    cc.setFont("ipaexm", 12)
    x, y = cfg["legally_domiciled_first_pos"]
    cc.drawString(x, y, str(cfg["legally_domiciled_first"]))
    cc.drawString(x, y - 21, str(cfg["legally_domiciled_second"]))
    if cfg["is_banchi_legally_domiciled"]:
        cc.ellipse(346, 473, 316, 462)
    else:
        cc.circle(327, 457, 6)
    cc.drawString(x + 10, y - 44, str(cfg["head_of_person_of_legally_domiciled"]))
    return cc


def husband_family_info(cfg, cc):
    cc.setFont("ipaexm", 12)
    x, y = cfg["father_name_pos"]
    cc.drawString(x, y, str(cfg["father_name"]))
    x, y = cfg["mother_name_pos"]
    cc.drawString(x, y, str(cfg["mother_name"]))
    cc.drawString(351, 385, str(cfg["relationship"]))


def wife_name_info(cfg, cc):
    cc.setFont("ipaexm", 24)
    x, y = cfg["last_name_pos"]
    cc.drawString(x, y, cfg["last_name"])
    cc.setFont("ipaexm", 12)
    x, y = cfg["last_name_kana_pos"]
    cc.drawString(x, y, cfg["last_name_kana"])
    cc.setFont("ipaexm", 24)
    x, y = cfg["first_name_pos"]
    cc.drawString(x, y, cfg["first_name"])
    cc.setFont("ipaexm", 12)
    x, y = cfg["first_name_kana_pos"]
    cc.drawString(x, y, cfg["first_name_kana"])
    cc.setFont("ipaexm", 12)
    cc.drawString(421, 569, str(cfg["birth_year"]))
    cc.drawString(500, 569, str(cfg["birth_month"]))
    cc.drawString(545, 569, str(cfg["birth_day"]))
    return cc


def wife_address_info(cfg, cc):
    cc.setFont("ipaexm", 12)
    x, y = cfg["address_first_pos"]
    cc.drawString(x, y, str(cfg["address_first"]))
    cc.drawString(x - 12, y - 21, str(cfg["address_second"]))
    if cfg["is_banchi_address"]:
        cc.ellipse(502, 539, 472, 528)
    else:
        cc.circle(481, 523, 6)
    cc.drawString(x + 80, y - 21, str(cfg["address_go"]))
    cc.drawString(x + 10, y - 44, str(cfg["household_person"]))
    cc.setFont("ipaexm", 5)
    y -= 13
    for text in cfg["address_apartment"].split("\n"):
        cc.drawString(x+130, y, text)
        y -= 5
    return cc


def wife_legally_domiciled_info(cfg, cc):
    cc.setFont("ipaexm", 12)
    x, y = cfg["legally_domiciled_first_pos"]
    cc.drawString(x, y, str(cfg["legally_domiciled_first"]))
    cc.drawString(x, y - 21, str(cfg["legally_domiciled_second"]))
    if cfg["is_banchi_legally_domiciled"]:
        cc.ellipse(549, 473, 519, 462)
    else:
        cc.circle(327, 457, 6)
    cc.drawString(x + 10, y - 44, str(cfg["head_of_person_of_legally_domiciled"]))
    return cc


def wife_family_info(cfg, cc):
    cc.setFont("ipaexm", 12)
    x, y = cfg["father_name_pos"]
    cc.drawString(x, y, str(cfg["father_name"]))
    x, y = cfg["mother_name_pos"]
    cc.drawString(x, y, str(cfg["mother_name"]))
    cc.drawString(551, 385, str(cfg["relationship"]))
    return cc


def new_legally_domiciled(cfg, cc):
    cc.setFont("ipaexm", 12)
    if cfg["is_husband_lastname"]:
        cc.drawString(194, 351, "✓")
    else:
        cc.drawString(194, 340, "✓")
    cc.setFont("ipaexm", 16)
    if cfg["address"] != "":
        x, y = cfg["address_pos"]
        cc.drawString(x, y, str(cfg["address"]))
        if cfg["is_banchi_address"]:
            cc.ellipse(547, 352, 520, 341)
        else:
            cc.circle(529, 334, 6)
    return cc


def to_live_together_info(cfg, cc):
    cc.setFont("ipaexm", 15)
    cc.drawString(220, 310, str(cfg["year"]))
    cc.drawString(300, 310, str(cfg["month"]))
    return cc


def husband_marital_history_info(cfg, cc):
    if cfg["marriage_cat"] == 0:
        cc.setFont("ipaexm", 12)
        cc.drawString(196, 290, "✓")
    elif cfg["marriage_cat"] == 1:
        cc.setFont("ipaexm", 12)
        cc.drawString(273, 295, "✓")
        cc.setFont("ipaexm", 6)
        cc.drawString(301, 289, str(cfg["year"]))
        cc.drawString(338, 289, str(cfg["month"]))
        cc.drawString(365, 289, str(cfg["day"]))
    else:
        cc.setFont("ipaexm", 12)
        cc.drawString(273, 285, "✓")
        cc.setFont("ipaexm", 6)
        cc.drawString(301, 289, str(cfg["year"]))
        cc.drawString(338, 289, str(cfg["month"]))
        cc.drawString(365, 289, str(cfg["day"]))
    return cc


def wife_marital_history_info(cfg, cc):
    if cfg["marriage_cat"] == 0:
        cc.setFont("ipaexm", 12)
        cc.drawString(398, 290, "✓")
    elif cfg["marriage_cat"] == 1:
        cc.setFont("ipaexm", 12)
        cc.drawString(476, 295, "✓")
        cc.setFont("ipaexm", 6)
        cc.drawString(504, 289, str(cfg["year"]))
        cc.drawString(542, 289, str(cfg["month"]))
        cc.drawString(569, 289, str(cfg["day"]))
    else:
        cc.setFont("ipaexm", 12)
        cc.drawString(476, 285, "✓")
        cc.setFont("ipaexm", 6)
        cc.drawString(504, 289, str(cfg["year"]))
        cc.drawString(542, 289, str(cfg["month"]))
        cc.drawString(569, 289, str(cfg["day"]))
    return cc


def husband_job_type(cfg, cc):
    x, y = 210, 271
    cc.setFont("ipaexm", 12)
    if cfg["job_type"] == 1:
        cc.drawString(x, y, "✓")
    elif cfg["job_type"] == 2:
        cc.drawString(x, y-11, "✓")
    elif cfg["job_type"] == 3:
        cc.drawString(x, y-21, "✓")
    elif cfg["job_type"] == 4:
        cc.drawString(x, y-41, "✓")
    elif cfg["job_type"] == 5:
        cc.drawString(x, y-62, "✓")
    elif cfg["job_type"] == 6:
        cc.drawString(x, y-72, "✓")
    return cc


def wife_job_type(cfg, cc):
    x, y = 249, 271
    cc.setFont("ipaexm", 12)
    if cfg["job_type"] == 1:
        cc.drawString(x, y, "✓")
    elif cfg["job_type"] == 2:
        cc.drawString(x, y-11, "✓")
    elif cfg["job_type"] == 3:
        cc.drawString(x, y-21, "✓")
    elif cfg["job_type"] == 4:
        cc.drawString(x, y-41, "✓")
    elif cfg["job_type"] == 5:
        cc.drawString(x, y-62, "✓")
    elif cfg["job_type"] == 6:
        cc.drawString(x, y-72, "✓")
    return cc


def national_census_info(cfg, cc):
    cc.setFont("ipaexm", 6)
    if cfg["year"] != "":
        cc.drawString(278, 186, cfg["year"])
        cc.setFont("ipaexm", 16)
        cc.drawString(258, 168, str(cfg["husband_job"]))
        cc.drawString(458, 168, str(cfg["wife_job"]))
    return cc


def notification_info(cfg, cc):
    cc.setFont("ipaexm", 12)
    cc.drawString(141, 716, str(cfg["year"]))
    cc.drawString(181, 716, str(cfg["month"]))
    cc.drawString(210, 716, str(cfg["month"]))
    cc.drawString(141, 680, str(cfg["to"]))


def other_info(cfg, cc):
    cc.setFont("ipaexm", 12)
    x, y = 40, 145
    for text in cfg["text"].split("\n"):
        cc.drawString(x+130, y, text)
        y -= 15
    return cc


def main():
    config_path = resolve_config_path()
    cc = setup()
    cfg = load_config(config_path)
    husband_name_info(cfg["husband"], cc)
    husband_address_info(cfg["husband"], cc)
    husband_legally_domiciled_info(cfg["husband"], cc)
    husband_family_info(cfg["husband"], cc)
    wife_name_info(cfg["wife"], cc)
    wife_address_info(cfg["wife"], cc)
    wife_legally_domiciled_info(cfg["wife"], cc)
    wife_family_info(cfg["wife"], cc)
    new_legally_domiciled(cfg["new_legally_domiciled"], cc)
    to_live_together_info(cfg["to_live_together"], cc)
    husband_marital_history_info(cfg["husband"]["marital_history"], cc)
    wife_marital_history_info(cfg["wife"]["marital_history"], cc)
    husband_job_type(cfg["husband"], cc)
    wife_job_type(cfg["wife"], cc)
    national_census_info(cfg["national_census"], cc)
    notification_info(cfg["notification"], cc)
    other_info(cfg["other"], cc)
    cc.showPage()
    cc.save()


if __name__ == "__main__":
    main()
