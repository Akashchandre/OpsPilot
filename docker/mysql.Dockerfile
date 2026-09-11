# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM docker.io/library/mysql:8.4.11@sha256:b3b90af2a6552ae30c266fdb7d5dd55f3afb72404bb78d37fe8a23eb857fd3fb AS prepared

USER root

RUN microdnf remove -y mysql-shell \
    && microdnf upgrade -y \
      curl-7.76.1-40.el9_8.5.x86_64 \
      libcurl-7.76.1-40.el9_8.5.x86_64 \
      sqlite-libs-3.34.1-11.el9_8.x86_64 \
    && microdnf clean all \
    && rm -f /usr/local/bin/gosu \
    && test "$(rpm -q --qf '%{VERSION}-%{RELEASE}' curl)" = "7.76.1-40.el9_8.5" \
    && test "$(rpm -q --qf '%{VERSION}-%{RELEASE}' libcurl)" = "7.76.1-40.el9_8.5" \
    && test "$(rpm -q --qf '%{VERSION}-%{RELEASE}' sqlite-libs)" = "3.34.1-11.el9_8" \
    && ! rpm -q mysql-shell \
    && test ! -e /usr/local/bin/gosu

USER 999:999

FROM scratch

ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    MYSQL_MAJOR=8.4 \
    MYSQL_VERSION=8.4.11-1.el9

COPY --from=prepared / /

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["mysqld"]

EXPOSE 3306 33060
VOLUME ["/var/lib/mysql"]

USER 999:999
